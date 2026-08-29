"""Нөөшлөлт — бүх салбарын өгөгдлийг нэг ZIP файлд.

Яагаад энгийн файл хуулбарлалт БОЛОХГҮЙ вэ:
    DB-үүд WAL горимд ажиллаж байгаа тул `.db` файлыг дангаар нь хуулбал
    хамгийн сүүлийн гүйлгээнүүд `-wal` файлд үлдэж, бүрэн бус нөөц гарна.
    Тиймээс SQLite-ийн ONLINE BACKUP API ашиглана — сервер ажиллаж, касс
    захиалга бичиж байхад ч бүтэн бөгөөд тогтвортой хуулбар үүснэ.

ZIP-ийн бүтэц:
    manifest.json          — огноо, хувилбар, салбарын жагсаалт
    central.db             — салбар ба глобал хэрэглэгчийн бүртгэл
    branches/<код>.db      — салбар тус бүрийн бүрэн өгөгдөл

.env (SECRET_KEY) нөөцөд ОРОХГҮЙ: нууц түлхүүрийг задгай ZIP-д хийвэл
нөөцөө дамжуулах бүрд алдагдах эрсдэлтэй. Түүнийг алдвал хэрэглэгчид
дахин нэвтрэхээс өөр үр дагаваргүй.
"""
import json
import os
import re
import shutil
import sqlite3
import tempfile
import threading
import zipfile
from datetime import datetime

import central

BACKUP_DIR = os.path.join(central.BASE_DIR, "backups")
MANIFEST = "manifest.json"
FORMAT_VERSION = 1

# Салбарын DB-д заавал байх хүснэгтүүд — сэргээхийн өмнө шалгана
_REQUIRED_TABLES = {"orders", "order_items", "users", "services"}

_lock = threading.Lock()


def _ts():
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _safe_name(name: str) -> str:
    """Замын халдлагаас хамгаална (../ гэх мэт)."""
    return os.path.basename(re.sub(r"[^0-9A-Za-z._-]", "", name or ""))


def _snapshot(src_path: str, dst_path: str) -> None:
    """SQLite online backup — ажиллаж байгаа DB-ээс бүтэн хуулбар."""
    src = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
    try:
        dst = sqlite3.connect(dst_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


# ── Нөөц үүсгэх ────────────────────────────────────────
def create(note: str = "") -> dict:
    """Бүх салбарын өгөгдлийг нэг ZIP болгоно."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    branches = central.list_branches(active_only=False)

    name = f"backup-{_ts()}.zip"
    path = os.path.join(BACKUP_DIR, name)
    tmpdir = tempfile.mkdtemp(prefix="laundry-bk-")
    try:
        manifest = {
            "format": FORMAT_VERSION,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "note": (note or "").strip()[:200],
            "branches": [],
        }

        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            # Төвийн бүртгэл
            c_tmp = os.path.join(tmpdir, "central.db")
            _snapshot(central.CENTRAL_DB, c_tmp)
            z.write(c_tmp, "central.db")

            # Салбар бүр
            for b in branches:
                if not os.path.exists(b.db_file):
                    continue
                b_tmp = os.path.join(tmpdir, f"{b.code}.db")
                _snapshot(b.db_file, b_tmp)
                z.write(b_tmp, f"branches/{b.code}.db")
                manifest["branches"].append({
                    "code": b.code, "name": b.name,
                    "orders": _count(b_tmp, "orders"),
                    "bytes": os.path.getsize(b_tmp),
                })

            z.writestr(MANIFEST, json.dumps(manifest, ensure_ascii=False, indent=2))
    except Exception:
        if os.path.exists(path):
            os.remove(path)
        raise
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    return describe(name)


def _count(db_path: str, table: str) -> int:
    try:
        c = sqlite3.connect(db_path)
        try:
            return c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        finally:
            c.close()
    except sqlite3.Error:
        return 0


# ── Жагсаалт ───────────────────────────────────────────
def describe(name: str) -> dict:
    path = os.path.join(BACKUP_DIR, name)
    st = os.stat(path)
    info = {"name": name, "bytes": st.st_size,
            "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
            "branches": [], "note": ""}
    try:
        with zipfile.ZipFile(path) as z:
            m = json.loads(z.read(MANIFEST))
            info["branches"] = m.get("branches", [])
            info["note"] = m.get("note", "")
            info["created_at"] = m.get("created_at", info["created_at"])
    except (zipfile.BadZipFile, KeyError, ValueError):
        info["broken"] = True
    return info


def list_all() -> list:
    if not os.path.isdir(BACKUP_DIR):
        return []
    names = sorted((f for f in os.listdir(BACKUP_DIR) if f.endswith(".zip")),
                   reverse=True)
    return [describe(n) for n in names]


def path_of(name: str) -> str:
    p = os.path.join(BACKUP_DIR, _safe_name(name))
    if not os.path.isfile(p):
        raise FileNotFoundError(name)
    return p


def remove(name: str) -> None:
    os.remove(path_of(name))


def prune(keep: int) -> int:
    """Хамгийн сүүлийн `keep` ширхэгээс бусдыг устгана."""
    if keep <= 0:
        return 0
    names = sorted((f for f in os.listdir(BACKUP_DIR) if f.endswith(".zip")),
                   reverse=True)
    dropped = 0
    for n in names[keep:]:
        try:
            os.remove(os.path.join(BACKUP_DIR, n))
            dropped += 1
        except OSError:
            pass
    return dropped


def latest_age_hours():
    """Хамгийн сүүлийн нөөцөөс хойш өнгөрсөн цаг (нөөцгүй бол None)."""
    items = list_all()
    if not items:
        return None
    newest = max(os.path.getmtime(os.path.join(BACKUP_DIR, i["name"])) for i in items)
    return (datetime.now().timestamp() - newest) / 3600.0


# ── Сэргээх ────────────────────────────────────────────
def inspect(zip_path: str) -> dict:
    """Сэргээхийн ӨМНӨ агуулгыг шалгана."""
    with zipfile.ZipFile(zip_path) as z:
        names = set(z.namelist())
        if MANIFEST not in names or "central.db" not in names:
            raise ValueError("Нөөцийн файл танигдсангүй (manifest эсвэл central.db алга)")
        manifest = json.loads(z.read(MANIFEST))
        if int(manifest.get("format", 0)) > FORMAT_VERSION:
            raise ValueError("Нөөц илүү шинэ хувилбарынх — програмаа шинэчилнэ үү")
        branch_files = sorted(n for n in names if n.startswith("branches/")
                              and n.endswith(".db"))
    manifest["files"] = branch_files
    return manifest


def _validate_sqlite(path: str, need_tables=False) -> None:
    c = sqlite3.connect(path)
    try:
        if c.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Нөөц доторх өгөгдлийн сан эвдэрсэн байна")
        if need_tables:
            have = {r[0] for r in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
            missing = _REQUIRED_TABLES - have
            if missing:
                raise ValueError("Нөөц дутуу: %s хүснэгт алга" % ", ".join(sorted(missing)))
    finally:
        c.close()


def restore(zip_path: str) -> dict:
    """Нөөцөөс сэргээнэ. Одоогийн өгөгдлийг ЭХЛЭЭД нөөцөлж авна.

    Алхмууд:
      1. ZIP-ийг задалж, DB бүрийн бүрэн бүтэц шалгах
      2. Одоогийн өгөгдлийн аюулгүйн нөөц үүсгэх
      3. Бүх engine-ийг хааж, файлуудыг солих
      4. Алдаа гарвал хуучин файлуудыг БУЦААЖ тавих
    """
    with _lock:
        manifest = inspect(zip_path)
        tmpdir = tempfile.mkdtemp(prefix="laundry-rs-")
        moved = []          # (target, backup_of_old)
        try:
            # 1. Задалж шалгана
            with zipfile.ZipFile(zip_path) as z:
                z.extract("central.db", tmpdir)
                _validate_sqlite(os.path.join(tmpdir, "central.db"))
                for rel in manifest["files"]:
                    z.extract(rel, tmpdir)
                    _validate_sqlite(os.path.join(tmpdir, rel), need_tables=True)

            # 2. Аюулгүйн нөөц
            safety = create(note="Сэргээхийн өмнөх автомат нөөц")

            # 3. Engine-үүдийг хааж, солино
            central.shutdown_all()

            targets = [(os.path.join(tmpdir, "central.db"), central.CENTRAL_DB)]
            # Салбарын файлын БАЙРШЛЫГ нөөц доторх central.db-ээс уншина
            new_central = os.path.join(tmpdir, "central.db")
            cc = sqlite3.connect(new_central)
            try:
                rows = cc.execute("SELECT code, db_file FROM branches").fetchall()
            finally:
                cc.close()
            by_code = {code: db_file for code, db_file in rows}

            for rel in manifest["files"]:
                code = os.path.splitext(os.path.basename(rel))[0]
                dest = by_code.get(code)
                if not dest:
                    continue
                targets.append((os.path.join(tmpdir, rel), dest))

            for src, dest in targets:
                os.makedirs(os.path.dirname(dest) or central.BASE_DIR, exist_ok=True)
                old = dest + ".restore-old"
                if os.path.exists(dest):
                    if os.path.exists(old):
                        os.remove(old)
                    os.replace(dest, old)
                    moved.append((dest, old))
                else:
                    moved.append((dest, None))
                shutil.copy2(src, dest)
                # WAL/SHM үлдэгдлийг цэвэрлэнэ — шинэ файлтай зөрчилдөнө
                for suffix in ("-wal", "-shm"):
                    stale = dest + suffix
                    if os.path.exists(stale):
                        os.remove(stale)

            central.bootstrap()
            return {"restored": len(targets), "safety_backup": safety["name"],
                    "manifest": manifest}

        except Exception:
            # Буцаах — хуучин файлуудыг сэргээнэ
            for dest, old in reversed(moved):
                try:
                    if os.path.exists(dest):
                        os.remove(dest)
                    if old and os.path.exists(old):
                        os.replace(old, dest)
                except OSError:
                    pass
            central.bootstrap()
            raise
        finally:
            for dest, old in moved:
                if old and os.path.exists(old):
                    try:
                        os.remove(old)
                    except OSError:
                        pass
            shutil.rmtree(tmpdir, ignore_errors=True)
