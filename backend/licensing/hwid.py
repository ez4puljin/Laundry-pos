"""Тухайн компьютерийг таних хатуу хангамжийн хурууны хээ (fingerprint).

4 бүрдэл хэсгээс тогтоно. Бүрдэл тус бүр sha256-ийн эхний 5 байт.
Зарим эд анги солигдсон ч (диск, RAM) 2 бүрдэл таарвал зөвшөөрнө —
харин диск хуулж өөр компьютерт залгавал таарахгүй.

Бүх мэдээллийг registry / kernel32-оос уншина: subprocess дуудахгүй тул хурдан.
"""

import ctypes
import hashlib
import base64
import sys

COMPONENTS = 4
COMP_LEN = 5
HW_LEN = COMPONENTS * COMP_LEN  # 20 байт

_EMPTY = b"\x00" * COMP_LEN
_cache = None


def _reg(path: str, name: str) -> str:
    """HKEY_LOCAL_MACHINE-аас утга унших. Олдохгүй бол хоосон мөр."""
    if sys.platform != "win32":
        return ""
    import winreg

    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE, path, 0,
            winreg.KEY_READ | winreg.KEY_WOW64_64KEY,
        )
        try:
            value, _ = winreg.QueryValueEx(key, name)
        finally:
            winreg.CloseKey(key)
        return str(value).strip()
    except OSError:
        return ""


def _volume_serial(drive: str = "C:\\") -> str:
    if sys.platform != "win32":
        return ""
    try:
        serial = ctypes.c_ulong(0)
        ok = ctypes.windll.kernel32.GetVolumeInformationW(
            ctypes.c_wchar_p(drive), None, 0, ctypes.byref(serial), None, None, None, 0
        )
        return f"{serial.value:08x}" if ok else ""
    except Exception:
        return ""


def _digest(raw: str) -> bytes:
    """Хоосон биш бол sha256-ийн эхний 5 байт, хоосон бол 0-ууд."""
    raw = (raw or "").strip()
    if not raw:
        return _EMPTY
    return hashlib.sha256(b"cemby-hw-v1|" + raw.encode("utf-8", "replace")).digest()[:COMP_LEN]


def _collect() -> bytes:
    sysinfo = r"SYSTEM\CurrentControlSet\Control\SystemInformation"
    bios = r"HARDWARE\DESCRIPTION\System\BIOS"
    cpu0 = r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"

    # 1. Windows суулгацын өвөрмөц ID (OS дахин суулгавал л өөрчлөгдөнө)
    c1 = _reg(r"SOFTWARE\Microsoft\Cryptography", "MachineGuid")
    # 2. Эх хавтангийн техник хангамжийн ID
    c2 = _reg(sysinfo, "ComputerHardwareId")
    # 3. Системийн диск + загварын нэр
    c3 = _volume_serial() + "|" + _reg(sysinfo, "SystemProductName")
    # 4. Процессор + эх хавтан
    c4 = (
        _reg(cpu0, "Identifier") + "|" + _reg(cpu0, "ProcessorNameString")
        + "|" + _reg(bios, "BaseBoardProduct")
    )

    return b"".join(_digest(c) for c in (c1, c2, c3, c4))


def fingerprint() -> bytes:
    """20 байт хурууны хээ. Процессын турш нэг л удаа тооцоолно."""
    global _cache
    if _cache is None:
        _cache = _collect()
    return _cache


def split(hw: bytes):
    return [hw[i * COMP_LEN:(i + 1) * COMP_LEN] for i in range(COMPONENTS)]


def matches(issued: bytes, current: bytes = None) -> bool:
    """Лиценз олгосон үеийн хээ одоогийнхтой таарч байна уу.

    Олгох үед байсан (хоосон биш) бүрдлүүдээс хамгийн багадаа 2 нь таарах ёстой.
    Хэрэв олгох үед ердөө 1 бүрдэл л байсан бол тэр нэг нь таарна.
    """
    if current is None:
        current = fingerprint()
    if len(issued) != HW_LEN or len(current) != HW_LEN:
        return False

    issued_parts = split(issued)
    current_parts = split(current)

    available = sum(1 for p in issued_parts if p != _EMPTY)
    if available == 0:
        return False

    matched = sum(
        1 for a, b in zip(issued_parts, current_parts) if a != _EMPTY and a == b
    )
    return matched >= min(2, available)


def machine_code(hw: bytes = None) -> str:
    """Хэрэглэгчид үзүүлэх / уншуулах машины код (32 тэмдэгт, 4-4 бүлэглэсэн)."""
    raw = base64.b32encode(hw if hw is not None else fingerprint()).decode().rstrip("=")
    return "-".join(raw[i:i + 4] for i in range(0, len(raw), 4))


def parse_machine_code(code: str) -> bytes:
    """Машины кодыг 20 байт болгож задлах (keygen ашиглана)."""
    clean = "".join(ch for ch in (code or "").upper() if ch.isalnum())
    pad = "=" * (-len(clean) % 8)
    raw = base64.b32decode(clean + pad)
    if len(raw) != HW_LEN:
        raise ValueError("Машины код буруу урттай байна")
    return raw
