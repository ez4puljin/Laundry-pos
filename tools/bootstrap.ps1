# Laundry POS - шаардлагатай програмуудыг АВТОМАТААР суулгах
#
# install.bat энэ скриптийг дуудна. Шинэ компьютерт Python болон Node.js
# байхгүй бол өөрөө татаж суулгана:
#   1. winget (Windows 10 1809+ / Windows 11 дээр бэлэн байдаг)
#   2. winget байхгүй бол албан ёсны суулгагчийг шууд татна
#
# Суулгасны дараа PATH-ыг registry-ээс дахин уншиж, шинэ програмуудыг
# тухайн session дотор шууд ашиглах боломжтой болгоно.
#
# ЧУХАЛ: энэ файлыг UTF-8 BOM-той хадгална. BOM-гүй бол Windows
# PowerShell 5.1 нь кирилл үсгийг ANSI гэж уншиж эвдэнэ.

[CmdletBinding()]
param(
    # Дотоод хэрэглээ: эрх ахиулж дахин дуудагдсан эсэх
    [switch]$Elevated
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Татаж авах нөөц суулгагчид (winget ажиллахгүй үед)
$PYTHON_FALLBACK = 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe'
$NODE_FALLBACK = 'https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi'

$MIN_PY_MINOR = 10   # Python 3.10+


function Write-Step($text) { Write-Host "  $text" }
function Write-Ok($text) { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Write-Err($text) { Write-Host "  [X] $text" -ForegroundColor Red }


function Update-PathFromRegistry {
    <#  Суулгагч PATH-г registry-д бичдэг ч ажиллаж буй process-д
        автоматаар тусдаггүй. Тиймээс гараар дахин уншина.  #>
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $joined = @($machine, $user) | Where-Object { $_ }
    if ($joined) { $env:Path = ($joined -join ';') }
}


function Publish-PathForCaller {
    <#  install.bat шинэ PATH-ыг өвлөж авахын тулд файлаар дамжуулна.
        (Дэд process эцэг process-ийн орчныг өөрчилж чаддаггүй.)  #>
    try {
        [IO.File]::WriteAllText(
            (Join-Path $env:TEMP 'lpos_path.txt'), $env:Path,
            (New-Object Text.UTF8Encoding($false)))
    } catch { }
}


function Get-WorkingPython {
    <#  Ажиллах чадвартай Python 3.10+ хайна.
        WindowsApps доторх "python.exe" нь ихэвчлэн Store-ийн хуурамч
        товчлол байдаг тул --version гаргаж чадаж байгаагаар нь шалгана.  #>
    foreach ($name in @('py', 'python')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if (-not $cmd) { continue }
        try {
            $out = & $name '--version' 2>&1 | Out-String
        } catch { continue }
        if ($out -match 'Python\s+(\d+)\.(\d+)') {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -eq 3 -and $minor -ge $MIN_PY_MINOR) {
                return [pscustomobject]@{ Cmd = $name; Version = "$major.$minor" }
            }
            Write-Warn "$name -> Python $major.$minor (3.$MIN_PY_MINOR+ шаардлагатай)"
        }
    }
    return $null
}


function Get-WorkingNode {
    $cmd = Get-Command 'node' -ErrorAction SilentlyContinue
    if (-not $cmd) { return $null }
    try {
        $out = & node '--version' 2>&1 | Out-String
    } catch { return $null }
    if ($out -match 'v(\d+)\.') {
        $major = [int]$Matches[1]
        if ($major -ge 18) { return [pscustomobject]@{ Version = $out.Trim() } }
        Write-Warn "Node.js $($out.Trim()) хэт хуучин (v18+ шаардлагатай)"
    }
    return $null
}


function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]$id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}


function Install-ViaWinget($packageId, $label) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) { return $false }

    Write-Step "$label -г winget-ээр суулгаж байна (хэдэн минут)..."
    $args = @(
        'install', '--id', $packageId, '--exact',
        '--source', 'winget', '--silent',
        '--accept-source-agreements', '--accept-package-agreements',
        '--disable-interactivity'
    )
    try {
        $proc = Start-Process -FilePath $winget.Source -ArgumentList $args `
            -Wait -PassThru -NoNewWindow
    } catch {
        Write-Warn "winget ажиллуулахад алдаа: $($_.Exception.Message)"
        return $false
    }
    # 0 = амжилттай, -1978335189 = аль хэдийн суусан
    if ($proc.ExitCode -eq 0 -or $proc.ExitCode -eq -1978335189) { return $true }
    Write-Warn "winget буцаалт: $($proc.ExitCode)"
    return $false
}


function Install-FromUrl($url, $label, $argList) {
    Write-Step "$label -г албан ёсны сайтаас татаж байна..."
    $file = Join-Path $env:TEMP (Split-Path $url -Leaf)
    try {
        Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing
    } catch {
        Write-Err "Татаж чадсангүй: $($_.Exception.Message)"
        return $false
    }

    Write-Step "$label -г суулгаж байна..."
    try {
        if ($file -like '*.msi') {
            $proc = Start-Process 'msiexec.exe' `
                -ArgumentList (@('/i', "`"$file`"") + $argList) -Wait -PassThru
        } else {
            $proc = Start-Process $file -ArgumentList $argList -Wait -PassThru
        }
    } catch {
        Write-Err "Суулгагч ажиллуулахад алдаа: $($_.Exception.Message)"
        return $false
    } finally {
        Remove-Item $file -Force -ErrorAction SilentlyContinue
    }

    if ($proc.ExitCode -eq 0 -or $proc.ExitCode -eq 3010) { return $true }
    Write-Err "$label суулгагч буцаалт: $($proc.ExitCode)"
    return $false
}


function Install-Python {
    if (Install-ViaWinget 'Python.Python.3.12' 'Python') { return $true }
    Write-Warn 'winget амжилтгүй — шууд татаж үзье.'
    return Install-FromUrl $PYTHON_FALLBACK 'Python' @(
        '/quiet', 'InstallAllUsers=1', 'PrependPath=1',
        'Include_launcher=1', 'Include_test=0', 'Include_pip=1'
    )
}


function Install-Node {
    if (Install-ViaWinget 'OpenJS.NodeJS.LTS' 'Node.js') { return $true }
    Write-Warn 'winget амжилтгүй — шууд татаж үзье.'
    return Install-FromUrl $NODE_FALLBACK 'Node.js' @('/qn', '/norestart')
}


# ══════════════════════════════════════════════════════════
#  Үндсэн урсгал
# ══════════════════════════════════════════════════════════
Update-PathFromRegistry

$python = Get-WorkingPython
$node = Get-WorkingNode

if ($python) { Write-Ok "Python $($python.Version) ($($python.Cmd))" }
if ($node) { Write-Ok "Node.js $($node.Version)" }

$needPython = -not $python
$needNode = -not $node

if (-not $needPython -and -not $needNode) {
    Write-Ok 'Шаардлагатай бүх програм суусан байна.'
    Publish-PathForCaller
    exit 0
}

Write-Host ''
if ($needPython) { Write-Warn 'Python олдсонгүй — автоматаар суулгана.' }
if ($needNode) { Write-Warn 'Node.js олдсонгүй — автоматаар суулгана.' }
Write-Host ''

# ── Админ эрх шаардлагатай: нэг удаа UAC асууна ──────────
if (-not (Test-Admin)) {
    if ($Elevated) {
        Write-Err 'Админ эрх авч чадсангүй.'
        exit 1
    }
    Write-Step 'Суулгахад админ эрх шаардлагатай.'
    Write-Step 'Гарч ирэх цонхонд "Yes" гэж хариулна уу...'
    Write-Host ''
    try {
        $proc = Start-Process 'powershell.exe' -Verb RunAs -Wait -PassThru `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass',
                            '-File', $PSCommandPath, '-Elevated')
    } catch {
        Write-Err 'Админ эрх олгоогүй тул суулгаж чадсангүй.'
        Write-Host ''
        Write-Step 'Гараар суулгаад install.bat -г ДАХИН ажиллуулна уу:'
        if ($needPython) { Write-Step '  Python : https://www.python.org/downloads/' }
        if ($needNode) { Write-Step '  Node.js: https://nodejs.org/' }
        exit 1
    }

    Update-PathFromRegistry
    $python = Get-WorkingPython
    $node = Get-WorkingNode
    if ($python -and $node) {
        Write-Host ''
        Write-Ok "Python $($python.Version)"
        Write-Ok "Node.js $($node.Version)"
        Publish-PathForCaller
        exit 0
    }
    Write-Err 'Суулгасны дараа ч програмууд олдсонгүй.'
    Write-Step 'Компьютерээ дахин асааж install.bat -г ажиллуулна уу.'
    exit 1
}

# ── Эндээс цааш админ эрхтэй ─────────────────────────────
$failed = $false
if ($needPython -and -not (Install-Python)) { $failed = $true }
if ($needNode -and -not (Install-Node)) { $failed = $true }

Update-PathFromRegistry
$python = Get-WorkingPython
$node = Get-WorkingNode

Write-Host ''
if ($python) { Write-Ok "Python $($python.Version)" } else { Write-Err 'Python суусангүй' }
if ($node) { Write-Ok "Node.js $($node.Version)" } else { Write-Err 'Node.js суусангүй' }

if ($python -and $node) {
    Publish-PathForCaller
    exit 0
}

if ($failed) {
    Write-Host ''
    Write-Step 'Гараар суулгаад install.bat -г ДАХИН ажиллуулна уу:'
    if (-not $python) { Write-Step '  Python : https://www.python.org/downloads/' }
    if (-not $node) { Write-Step '  Node.js: https://nodejs.org/' }
}
exit 1
