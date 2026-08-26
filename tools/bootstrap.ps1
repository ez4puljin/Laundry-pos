# Laundry POS - shaardlagatai programuudyg AVTOMATAAR suulgah
#
# install.bat ene skriptiig duudna. Shine kompyutert Python bolon Node.js
# baihgui bol ooroo tataj suulgana:
#   1. winget (Windows 10 1809+ / Windows 11 deer belen baidag)
#   2. winget baihgui bol alban yosny suulgagchiig shuud tatna
#
# Suulgasny daraa PATH-yg registry-ees dahin unshij, shine programuudyg
# tuhain session dotor shuud ashiglah bolomjtoi bolgono.
#
# ANHAAR: ene fail zowhon ASCII useg aguulna. Kirill useg bichvel
# konsol deer "?" bolj haragdah bolon Windows PowerShell 5.1 ni
# BOM-gui failyg ANSI gej unshij evdene.

[CmdletBinding()]
param(
    # Dotood hereglee: erh ahiulj dahin duudagdsan eseh
    [switch]$Elevated
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Tataj avah noots suulgagchid (winget ajillahgui uyed)
$PYTHON_FALLBACK = 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe'
$NODE_FALLBACK = 'https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi'

$MIN_PY_MINOR = 10   # Python 3.10+


function Write-Step($text) { Write-Host "  $text" }
function Write-Ok($text) { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn2($text) { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Write-Err2($text) { Write-Host "  [X] $text" -ForegroundColor Red }


function Update-PathFromRegistry {
    <#  Suulgagch PATH-g registry-d bichdeg ch ajillaj bui process-d
        avtomataar tusdaggui. Tiimees garaar dahin unshina.  #>
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $joined = @($machine, $user) | Where-Object { $_ }
    if ($joined) { $env:Path = ($joined -join ';') }
}


function Publish-PathForCaller {
    <#  install.bat shine PATH-yg ovloj avahyn tuld failaar damjuulna.
        (Ded process etseg process-iin orchnyg ooerchilj chaddaggui.)  #>
    try {
        [IO.File]::WriteAllText(
            (Join-Path $env:TEMP 'lpos_path.txt'), $env:Path,
            (New-Object Text.UTF8Encoding($false)))
    } catch { }
}


function Get-WorkingPython {
    <#  Ajillah chadvartai Python 3.10+ haina.
        WindowsApps dotorh "python.exe" nihevchlen Store-iin huuramch
        tovchlol baidag tul --version gargaj chadaj baigaagaar n shalgana.  #>
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
            Write-Warn2 "$name -> Python $major.$minor (3.$MIN_PY_MINOR+ shaardlagatai)"
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
        Write-Warn2 "Node.js $($out.Trim()) het huuchin (v18+ shaardlagatai)"
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

    Write-Step "$label -g winget-eer suulgaj baina (heden minut)..."
    $wargs = @(
        'install', '--id', $packageId, '--exact',
        '--source', 'winget', '--silent',
        '--accept-source-agreements', '--accept-package-agreements',
        '--disable-interactivity'
    )
    try {
        $proc = Start-Process -FilePath $winget.Source -ArgumentList $wargs `
            -Wait -PassThru -NoNewWindow
    } catch {
        Write-Warn2 "winget ajilluulahad aldaa: $($_.Exception.Message)"
        return $false
    }
    # 0 = amjilttai, -1978335189 = ali hediin suusan
    if ($proc.ExitCode -eq 0 -or $proc.ExitCode -eq -1978335189) { return $true }
    Write-Warn2 "winget butsaalt: $($proc.ExitCode)"
    return $false
}


function Install-FromUrl($url, $label, $argList) {
    Write-Step "$label -g alban yosny saitaas tataj baina..."
    $file = Join-Path $env:TEMP (Split-Path $url -Leaf)
    try {
        Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing
    } catch {
        Write-Err2 "Tataj chadsangui: $($_.Exception.Message)"
        return $false
    }

    Write-Step "$label -g suulgaj baina..."
    try {
        if ($file -like '*.msi') {
            $proc = Start-Process 'msiexec.exe' `
                -ArgumentList (@('/i', "`"$file`"") + $argList) -Wait -PassThru
        } else {
            $proc = Start-Process $file -ArgumentList $argList -Wait -PassThru
        }
    } catch {
        Write-Err2 "Suulgagch ajilluulahad aldaa: $($_.Exception.Message)"
        return $false
    } finally {
        Remove-Item $file -Force -ErrorAction SilentlyContinue
    }

    if ($proc.ExitCode -eq 0 -or $proc.ExitCode -eq 3010) { return $true }
    Write-Err2 "$label suulgagch butsaalt: $($proc.ExitCode)"
    return $false
}


function Install-Python {
    if (Install-ViaWinget 'Python.Python.3.12' 'Python') { return $true }
    Write-Warn2 'winget amjiltgui - shuud tataj uzye.'
    return Install-FromUrl $PYTHON_FALLBACK 'Python' @(
        '/quiet', 'InstallAllUsers=1', 'PrependPath=1',
        'Include_launcher=1', 'Include_test=0', 'Include_pip=1'
    )
}


function Install-Node {
    if (Install-ViaWinget 'OpenJS.NodeJS.LTS' 'Node.js') { return $true }
    Write-Warn2 'winget amjiltgui - shuud tataj uzye.'
    return Install-FromUrl $NODE_FALLBACK 'Node.js' @('/qn', '/norestart')
}


# ==========================================================
#  Undsen ursgal
# ==========================================================
Update-PathFromRegistry

$python = Get-WorkingPython
$node = Get-WorkingNode

if ($python) { Write-Ok "Python $($python.Version) ($($python.Cmd))" }
if ($node) { Write-Ok "Node.js $($node.Version)" }

$needPython = -not $python
$needNode = -not $node

if (-not $needPython -and -not $needNode) {
    Write-Ok 'Shaardlagatai buh program suusan baina.'
    Publish-PathForCaller
    exit 0
}

Write-Host ''
if ($needPython) { Write-Warn2 'Python oldsongui - avtomataar suulgana.' }
if ($needNode) { Write-Warn2 'Node.js oldsongui - avtomataar suulgana.' }
Write-Host ''

# -- Admin erh shaardlagatai: neg udaa UAC asuuna --
if (-not (Test-Admin)) {
    if ($Elevated) {
        Write-Err2 'Admin erh avch chadsangui.'
        exit 1
    }
    Write-Step 'Suulgahad admin erh shaardlagatai.'
    Write-Step 'Garch ireh tsonhond "Yes" gej hariulna uu...'
    Write-Host ''
    try {
        $proc = Start-Process 'powershell.exe' -Verb RunAs -Wait -PassThru `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass',
                            '-File', $PSCommandPath, '-Elevated')
    } catch {
        Write-Err2 'Admin erh olgoogui tul suulgaj chadsangui.'
        Write-Host ''
        Write-Step 'Garaar suulgaad install.bat -g DAHIN ajilluulna uu:'
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
    Write-Err2 'Suulgasny daraa ch programuud oldsongui.'
    Write-Step 'Kompyureeree dahin asaaj install.bat -g ajilluulna uu.'
    exit 1
}

# -- Endees tsaash admin erhtei --
$failed = $false
if ($needPython -and -not (Install-Python)) { $failed = $true }
if ($needNode -and -not (Install-Node)) { $failed = $true }

Update-PathFromRegistry
$python = Get-WorkingPython
$node = Get-WorkingNode

Write-Host ''
if ($python) { Write-Ok "Python $($python.Version)" } else { Write-Err2 'Python suusangui' }
if ($node) { Write-Ok "Node.js $($node.Version)" } else { Write-Err2 'Node.js suusangui' }

if ($python -and $node) {
    Publish-PathForCaller
    exit 0
}

if ($failed) {
    Write-Host ''
    Write-Step 'Garaar suulgaad install.bat -g DAHIN ajilluulna uu:'
    if (-not $python) { Write-Step '  Python : https://www.python.org/downloads/' }
    if (-not $node) { Write-Step '  Node.js: https://nodejs.org/' }
}
exit 1
