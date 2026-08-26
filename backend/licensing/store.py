"""Лицензийн бичлэгийг ОЛОН ГАЗАР давхардуулж хадгална.

Нэг байрлалыг устгаад туршилтын хугацааг тэглэх оролдлогоос хамгаална:
уншихдаа бүх байрлалыг нэгтгэж, ХАМГИЙН ХАТУУ утгыг сонгоод бүгд рүү
буцааж бичдэг (өөрөө өөрийгөө сэргээнэ).

Байрлалууд:
  1. %ProgramData%\\CembyPOS\\.sysdata
  2. %LOCALAPPDATA%\\CembyPOS\\.sysdata
  3. Registry: HKCU\\Software\\Classes\\CembyPOS.SysCache
  4. Програмын SQLite сан дахь `app_license` хүснэгт
"""

import base64
import os
import sqlite3
import sys
from pathlib import Path

_DIR_NAME = "CembyPOS"
_FILE_NAME = ".sysdata"
_REG_PATH = r"Software\Classes\CembyPOS.SysCache"
_REG_VALUE = "Data"
_DB_PATH = Path(__file__).resolve().parent.parent / "laundry_pos.db"

_FILE_ATTRIBUTE_HIDDEN = 0x02
_FILE_ATTRIBUTE_NORMAL = 0x80


# ── Файл дээрх хадгалалт ────────────────────────────────
def _file_paths():
    roots = []
    for env in ("ProgramData", "LOCALAPPDATA", "APPDATA"):
        value = os.environ.get(env)
        if value:
            roots.append(Path(value))
    if not roots:
        roots.append(Path.home())

    seen, paths = set(), []
    for root in roots[:2]:
        path = root / _DIR_NAME / _FILE_NAME
        if str(path).lower() not in seen:
            seen.add(str(path).lower())
            paths.append(path)
    return paths


def _set_hidden(path: Path, hidden: bool):
    if sys.platform != "win32":
        return
    try:
        attr = _FILE_ATTRIBUTE_HIDDEN if hidden else _FILE_ATTRIBUTE_NORMAL
        import ctypes

        ctypes.windll.kernel32.SetFileAttributesW(str(path), attr)
    except Exception:
        pass


def _file_read(path: Path):
    try:
        return path.read_bytes().strip() or None
    except OSError:
        return None


def _file_write(path: Path, data: bytes) -> bool:
    tmp = path.with_suffix(".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(data)
        _set_hidden(path, False)
        os.replace(tmp, path)
        _set_hidden(path, True)
        return True
    except OSError:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        return False


# ── Registry дээрх хадгалалт ────────────────────────────
def _reg_read():
    if sys.platform != "win32":
        return None
    import winreg

    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_PATH, 0, winreg.KEY_READ)
        try:
            value, _ = winreg.QueryValueEx(key, _REG_VALUE)
        finally:
            winreg.CloseKey(key)
        return str(value).strip().encode() or None
    except OSError:
        return None


def _reg_write(data: bytes) -> bool:
    if sys.platform != "win32":
        return False
    import winreg

    try:
        key = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, _REG_PATH, 0, winreg.KEY_WRITE)
        try:
            winreg.SetValueEx(key, _REG_VALUE, 0, winreg.REG_SZ, data.decode())
        finally:
            winreg.CloseKey(key)
        return True
    except OSError:
        return False


# ── SQLite дээрх хадгалалт ──────────────────────────────
def _db_connect():
    return sqlite3.connect(str(_DB_PATH), timeout=5)


def _db_read():
    if not _DB_PATH.exists():
        return None
    try:
        conn = _db_connect()
        try:
            row = conn.execute(
                "SELECT data FROM app_license WHERE id = 1"
            ).fetchone()
        finally:
            conn.close()
        return (row[0] or "").strip().encode() if row and row[0] else None
    except sqlite3.Error:
        return None


def _db_write(data: bytes) -> bool:
    try:
        conn = _db_connect()
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS app_license "
                "(id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT)"
            )
            conn.execute(
                "INSERT INTO app_license (id, data) VALUES (1, ?) "
                "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                (data.decode(),),
            )
            conn.commit()
        finally:
            conn.close()
        return True
    except sqlite3.Error:
        return False


# ── Нийтийн интерфэйс ───────────────────────────────────
def read_all():
    """Бүх байрлалаас түүхий (base64-гүй) бичлэгүүдийг унших."""
    blobs = []
    for path in _file_paths():
        blobs.append(_file_read(path))
    blobs.append(_reg_read())
    blobs.append(_db_read())

    out = []
    for blob in blobs:
        if not blob:
            continue
        try:
            out.append(base64.b64decode(blob, validate=True))
        except Exception:
            # Гэмтсэн бичлэг — үл тоомсорлоод дараа нь дарж бичнэ
            continue
    return out


def store_count() -> int:
    """Нийт хадгалах байрлалын тоо (файлууд + registry + SQLite)."""
    return len(_file_paths()) + 2


STORE_COUNT = store_count()


def write_all(record: bytes) -> int:
    """Бүх байрлал руу бичих. Амжилттай бичсэн байрлалын тоог буцаана."""
    data = base64.b64encode(record)
    count = 0
    for path in _file_paths():
        count += 1 if _file_write(path, data) else 0
    count += 1 if _reg_write(data) else 0
    count += 1 if _db_write(data) else 0
    return count


def clear_all():
    """Зөвхөн хөгжүүлэлт/тест үед — бүх байрлалыг цэвэрлэнэ."""
    for path in _file_paths():
        try:
            _set_hidden(path, False)
            path.unlink(missing_ok=True)
        except OSError:
            pass
    if sys.platform == "win32":
        import winreg

        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, _REG_PATH)
        except OSError:
            pass
    try:
        if _DB_PATH.exists():
            conn = _db_connect()
            try:
                conn.execute("DROP TABLE IF EXISTS app_license")
                conn.commit()
            finally:
                conn.close()
    except sqlite3.Error:
        pass
