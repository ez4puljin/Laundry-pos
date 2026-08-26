"""Лицензийн төлөв — уншиж, шалгаж, идэвхжүүлэх цөм.

Хамгаалалтын давхаргууд:
  1. Ed25519 гарын үсэг     — эрхийг гараар засах/хуурамчаар үйлдэх боломжгүй
  2. Машины хурууны хээ     — өөр компьютерт хуулбарлавал ажиллахгүй
  3. Цагийн хамгаалалт      — системийн цагийг ухраахад илэрч түгжигдэнэ
  4. 4 давхар хадгалалт     — нэгийг устгахад бусдаас сэргээгдэнэ
  5. Оролдлогын хязгаарлалт — нууц үг таах оролдлого экспоненциалаар удаашрана
"""

import hashlib
import hmac
import struct
import time

from . import grant as grant_mod
from . import hwid, store, vault

# ── Төлөвүүд ────────────────────────────────────────────
UNLICENSED = "unlicensed"   # хараахан идэвхжүүлээгүй
ACTIVE = "active"           # хэвийн ажиллаж байна
EXPIRED = "expired"         # туршилтын хугацаа дууссан
TAMPERED = "tampered"       # цаг ухраасан / бичлэг эвдэрсэн
MISMATCH = "mismatch"       # өөр компьютерийн эрх
BROKEN = "broken"           # pubkey.dat алга — тохиргоо дутуу

OK_STATES = (ACTIVE,)

# ── Runtime бичлэг ──────────────────────────────────────
_RT_FMT = "<BIIII"
_RT_BODY = struct.calcsize(_RT_FMT)      # 17
_RT_MAC = 16
_RT_LEN = _RT_BODY + _RT_MAC             # 33
_RT_VER = 1

_EMPTY_GRANT = b"\x00" * grant_mod.GRANT_LEN
RECORD_LEN = grant_mod.GRANT_LEN + _RT_LEN

# Цаг ухраасныг илрүүлэх хүлцэл (NTP залруулга, цагийн бүс — 10 минут)
CLOCK_SLACK = 600
# hwm-г дискэнд дахин бичих давтамж
HWM_WRITE_STEP = 300
# Төлөвийг санах ойд хадгалах хугацаа (хүсэлт бүрт диск уншихгүйн тулд)
CACHE_TTL = 10


class LicenseError(Exception):
    pass


def _rt_key(grant_sig: bytes) -> bytes:
    return hashlib.sha256(b"cemby-rt-v1" + (grant_sig or b"\x00" * 64)).digest()


def _rt_pack(state: dict, grant_sig: bytes) -> bytes:
    body = struct.pack(
        _RT_FMT, _RT_VER,
        state["hwm"] & 0xFFFFFFFF,
        state["runs"] & 0xFFFFFFFF,
        state["fails"] & 0xFFFFFFFF,
        state["lockout"] & 0xFFFFFFFF,
    )
    mac = hmac.new(_rt_key(grant_sig), body, hashlib.sha256).digest()[:_RT_MAC]
    return body + mac


def _rt_unpack(raw: bytes, grant_sig: bytes):
    if not raw or len(raw) != _RT_LEN:
        return None
    body, mac = raw[:_RT_BODY], raw[_RT_BODY:]
    expect = hmac.new(_rt_key(grant_sig), body, hashlib.sha256).digest()[:_RT_MAC]
    if not hmac.compare_digest(mac, expect):
        return None
    ver, hwm, runs, fails, lockout = struct.unpack(_RT_FMT, body)
    if ver != _RT_VER:
        return None
    return {"hwm": hwm, "runs": runs, "fails": fails, "lockout": lockout}


def _blank_state():
    return {"hwm": 0, "runs": 0, "fails": 0, "lockout": 0}


# ── Бүх хадгалалтыг нэгтгэх ─────────────────────────────
def _load():
    """Бүх байрлалыг уншиж хамгийн шинэ эрх + хамгийн хатуу runtime-г буцаана.

    Returns: (grant | None, runtime dict, found_count, corrupt_seen)
    """
    try:
        public_key = vault.public_key()
    except vault.VaultError:
        return None, _blank_state(), 0, False

    best_grant = None
    runtimes = []
    found = 0
    corrupt = False

    for record in store.read_all():
        if len(record) != RECORD_LEN:
            corrupt = True
            continue
        found += 1
        raw_grant = record[:grant_mod.GRANT_LEN]
        raw_rt = record[grant_mod.GRANT_LEN:]

        parsed = None
        if raw_grant != _EMPTY_GRANT:
            try:
                parsed = grant_mod.parse(raw_grant, public_key)
            except grant_mod.GrantError:
                corrupt = True
                continue

        sig = parsed.signature if parsed else None
        state = _rt_unpack(raw_rt, sig)
        if state is None:
            corrupt = True
        else:
            runtimes.append(state)

        if parsed and (best_grant is None or parsed.issued_at > best_grant.issued_at):
            best_grant = parsed

    merged = _blank_state()
    for state in runtimes:
        for field in merged:
            merged[field] = max(merged[field], state[field])

    return best_grant, merged, found, corrupt


def _save(g, state):
    raw_grant = g.raw if g else _EMPTY_GRANT
    sig = g.signature if g else None
    return store.write_all(raw_grant + _rt_pack(state, sig))


# ── Төлөв тооцоолох ─────────────────────────────────────
_cache = {"at": 0.0, "value": None}
_process_counted = False
_last_write = 0.0
# Байрлал дутуу байхад дахин бичих хамгийн бага завсар (диск элэгдүүлэхгүйн тулд)
HEAL_WRITE_STEP = 120


def _evaluate(persist: bool = True) -> dict:
    global _process_counted, _last_write

    try:
        vault.public_key()
    except vault.VaultError as exc:
        return {
            "state": BROKEN, "ok": False, "mode": None, "days_left": 0,
            "expires_at": None, "machine_code": hwid.machine_code(),
            "message": str(exc), "retry_after": 0,
        }

    now = int(time.time())
    g, state, found, corrupt = _load()

    # Цаг ухраасан эсэх — hwm-ээс мэдэгдэхүйц хойш явсан бол сэжигтэй
    clock_back = state["hwm"] > 0 and now < state["hwm"] - CLOCK_SLACK
    # Хугацаа тооцохдоо хэзээ ч ухраахгүй "хамгийн өндөр цаг"-ийг ашиглана
    effective = max(now, state["hwm"])

    dirty = False
    if effective > state["hwm"] + HWM_WRITE_STEP or state["hwm"] == 0:
        state["hwm"] = effective
        dirty = True
    if not _process_counted:
        state["runs"] += 1
        _process_counted = True
        dirty = True

    mono = time.monotonic()
    # Ямар нэг байрлал устсан/гэмтсэн бол бүгд рүү нь буцааж бичиж сэргээнэ
    if (found < store.STORE_COUNT or corrupt) and mono - _last_write > HEAL_WRITE_STEP:
        dirty = True

    if persist and dirty:
        _save(g, state)
        _last_write = mono

    result = {
        "mode": None, "days_left": 0, "expires_at": None,
        "machine_code": hwid.machine_code(),
        "retry_after": max(0, state["lockout"] - now),
    }

    if g is None:
        result.update(state=UNLICENSED, ok=False,
                      message="Систем идэвхжүүлээгүй байна. Мастер нууц үг шаардлагатай.")
        return result

    if not hwid.matches(g.hw):
        result.update(state=MISMATCH, ok=False,
                      message="Энэ эрх өөр компьютерт олгогдсон байна.")
        return result

    result["mode"] = "full" if g.is_full else "trial"
    result["expires_at"] = g.expires_at or None

    if clock_back:
        result.update(state=TAMPERED, ok=False,
                      message="Системийн цаг ухарсан байна. Эрхийг дахин нээнэ үү.")
        return result

    if g.expires_at:
        remaining = g.expires_at - effective
        result["days_left"] = max(0, -(-remaining // 86400))  # дээш нь бүхэлчилнэ
        if remaining <= 0:
            result.update(state=EXPIRED, ok=False,
                          message="Туршилтын хугацаа дууслаа. Эрх нээх шаардлагатай.")
            return result

    result.update(state=ACTIVE, ok=True, message="")
    return result


def status(force: bool = False) -> dict:
    """Одоогийн лицензийн төлөв. Хэзээ ч алдаа шиднэ гүй."""
    now = time.monotonic()
    if not force and _cache["value"] is not None and now - _cache["at"] < CACHE_TTL:
        return dict(_cache["value"])
    try:
        value = _evaluate()
    except Exception as exc:  # аль ч алдаанд систем нээлттэй үлдэхгүй
        value = {
            "state": BROKEN, "ok": False, "mode": None, "days_left": 0,
            "expires_at": None, "machine_code": "",
            "message": f"Лиценз шалгахад алдаа гарлаа: {exc}", "retry_after": 0,
        }
    _cache["at"] = now
    _cache["value"] = value
    return dict(value)


def is_ok() -> bool:
    return status()["ok"]


def invalidate():
    _cache["at"] = 0.0
    _cache["value"] = None


# ── Идэвхжүүлэх ─────────────────────────────────────────
def _backoff(fails: int) -> int:
    return min(5 * (2 ** max(0, fails - 1)), 900)


def _record_failure():
    g, state, _, _ = _load()
    state["fails"] += 1
    state["lockout"] = int(time.time()) + _backoff(state["fails"])
    state["hwm"] = max(state["hwm"], int(time.time()))
    _save(g, state)
    invalidate()
    return state


def _guard_rate_limit():
    _, state, _, _ = _load()
    wait = state["lockout"] - int(time.time())
    if wait > 0:
        raise LicenseError(
            f"Хэт олон буруу оролдлого. {wait} секундын дараа дахин оролдоно уу."
        )


def activate(mode: str, days: int = 0, password: str = None, key: str = None) -> dict:
    """Мастер нууц үг эсвэл идэвхжүүлэх түлхүүрээр эрх нээх.

    mode : "trial" (хоногоор) эсвэл "full" (хугацаагүй)
    """
    _guard_rate_limit()

    if key:
        try:
            g = grant_mod.from_key(key, vault.public_key())
        except (grant_mod.GrantError, vault.VaultError) as exc:
            _record_failure()
            raise LicenseError(str(exc))
        if not hwid.matches(g.hw):
            _record_failure()
            raise LicenseError("Энэ түлхүүр өөр компьютерт зориулагдсан байна.")
    elif password:
        try:
            private_key = vault.unlock(password)
        except vault.VaultError as exc:
            state = _record_failure()
            raise LicenseError(f"{exc} ({_backoff(state['fails'])} сек хүлээнэ үү)")
        mode_code = grant_mod.MODE_FULL if mode == "full" else grant_mod.MODE_TRIAL
        try:
            g = grant_mod.build(mode_code, days, hwid.fingerprint(), private_key)
        except grant_mod.GrantError as exc:
            raise LicenseError(str(exc))
    else:
        raise LicenseError("Мастер нууц үг эсвэл идэвхжүүлэх түлхүүр оруулна уу.")

    now = int(time.time())
    _, state, _, _ = _load()
    state["fails"] = 0
    state["lockout"] = 0
    state["hwm"] = max(state["hwm"], now)

    written = _save(g, state)
    invalidate()
    if written == 0:
        raise LicenseError("Эрхийг хадгалж чадсангүй — бичих эрх шалгана уу.")

    return status(force=True)
