"""Лицензийн команд мөрийн хэрэгсэл.

    python license_cli.py setup            # анхны тохиргоо (мастер нууц үг үүсгэх)
    python license_cli.py wizard           # суулгацын үед эрх нээх (install.bat)
    python license_cli.py menu             # бүрэн удирдлагын цэс (License.bat)
    python license_cli.py status           # одоогийн төлөв
    python license_cli.py machine          # машины код харах
    python license_cli.py activate --mode trial --days 7
    python license_cli.py activate --mode full
    python license_cli.py activate --key ABCD-EFGH-...

Хэрэглэгчийн бүх оролтыг cmd-ийн `set /p` биш ЭНД уншина: chcp 65001
идэвхтэй үед cmd оролт уншихдаа алдаа гаргадаг бол Python UTF-8-ыг
найдвартай зохицуулна.

ГАРАЛТ: Windows-ийн консол растер фонттой үед кирилл үсгийг `?` болгодог
тул энэ модулийн бүх хэвлэлтийг латин болгож гаргана (translit.latin).
Эх кодыг кириллээр бичсэн хэвээр үлдээв — засварлахад ойлгомжтой байна.
"""

import argparse
import getpass
import io
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

def _force_utf8(stream_name: str):
    """Windows консол дээр кирилл үсгийг зөв гаргах.

    Аль хэдийн UTF-8 болсон урсгалыг дахин боохгүй — давхар боовол
    эхний боолт цуглуулагдахдаа доод буферийг хааж алдаа өгдөг.
    """
    stream = getattr(sys, stream_name)
    if (getattr(stream, "encoding", "") or "").lower().replace("-", "") == "utf8":
        return
    buffer = getattr(stream, "buffer", None)
    if buffer is not None:
        setattr(sys, stream_name,
                io.TextIOWrapper(buffer, encoding="utf-8", errors="replace"))


if sys.platform == "win32":
    _force_utf8("stdout")
    _force_utf8("stderr")

import licensing
from licensing import vault
from licensing.translit import latin

LINE = "=" * 52


# Модулийн доторх бүх `print` дуудлагыг латин болгож дамжуулна.
# (Модулийн түвшний нэр builtins-ийг далдалдаг тул нэг цэгээс шийднэ.)
_builtin_print = print


def print(*args, **kwargs):          # noqa: A001 - зориудаар далдалж байна
    _builtin_print(*(latin(a) for a in args), **kwargs)


class Cancelled(Exception):
    """Хэрэглэгч цуцалсан эсвэл оролт дууссан."""


def _ask(prompt: str, default: str = "") -> str:
    try:
        value = input(latin(prompt)).strip()
    except (EOFError, KeyboardInterrupt):
        raise Cancelled
    return value or default


def _ask_password(prompt: str) -> str:
    try:
        return getpass.getpass(latin(prompt))
    except (EOFError, KeyboardInterrupt):
        raise Cancelled


def _ask_days(default: int = 7) -> int:
    while True:
        raw = _ask(f"  Хэдэн хоног ашиглах вэ? [{default}]: ", str(default))
        if raw.isdigit() and 1 <= int(raw) <= 3650:
            return int(raw)
        print("  [!] 1-3650 хоногийн хооронд тоо оруулна уу.\n")


def cmd_setup(_args) -> int:
    """Анхны тохиргоо — мастер нууц үг ба лицензийн түлхүүрийн хос үүсгэнэ."""
    if vault.exists():
        print("  [OK] Лицензийн түлхүүр аль хэдийн тохируулагдсан байна.")
        return 0
    if vault.PUBKEY_MODULE.exists() or vault.VAULT_PATH.exists():
        print("  [X] Лицензийн файлууд дутуу байна:")
        for path in (vault.VAULT_PATH, vault.PUBKEY_MODULE):
            print(f"      {'[байна]' if path.exists() else '[АЛГА] '} {path.name}")
        print()
        print("      git-ээс сэргээнэ үү:  git checkout -- backend/licensing")
        print("      Шинээр үүсгэвэл өмнө олгосон БҮХ эрх хүчингүй болно.")
        return 1

    print(LINE)
    print("  АНХНЫ ТОХИРГОО — МАСТЕР НУУЦ ҮГ")
    print(LINE)
    print()
    print("  Энэ нууц үг нь эрх нээх ЦОРЫН ГАНЦ түлхүүр болно.")
    print(f"  Хамгийн багадаа {vault.MIN_PASSWORD_LEN} тэмдэгт байх ёстой.")
    print()
    print("  !!! АНХААР: Мартвал сэргээх БОЛОМЖГҮЙ. Найдвартай хадгална уу !!!")
    print()

    for _ in range(3):
        pw1 = _ask_password("  Шинэ мастер нууц үг : ")
        problem = vault.check_strength(pw1)
        if problem:
            print(f"  [X] {problem}.\n")
            continue
        pw2 = _ask_password("  Дахин давтана уу   : ")
        if pw1 != pw2:
            print("  [X] Нууц үг таарсангүй.\n")
            continue
        print("\n  Түлхүүр үүсгэж байна (10-20 секунд)...")
        try:
            vault.create(pw1)
        except vault.VaultError as exc:
            print(f"  [X] {exc}")
            return 1
        print("  [OK] Мастер нууц үг тохирлоо.")
        print()
        print("  Дараах 2 файлыг ЗААВАЛ git-д commit хийж хадгална уу:")
        print("     backend/licensing/vault.dat")
        print("     backend/licensing/pubkey_data.py")
        return 0

    print("  [X] 3 удаа буруу оруулсан тул зогслоо.")
    return 1


def _print_status(st: dict):
    labels = {
        licensing.ACTIVE: "Идэвхтэй",
        licensing.EXPIRED: "Хугацаа дууссан",
        licensing.UNLICENSED: "Идэвхжүүлээгүй",
        licensing.TAMPERED: "Цаг өөрчлөгдсөн",
        licensing.MISMATCH: "Өөр компьютерийн эрх",
        licensing.BROKEN: "Тохиргоо дутуу",
    }
    mode = {"full": "Бүрэн эрх (хугацаагүй)", "trial": "Туршилтын хугацаа"}
    print(f"  Төлөв       : {labels.get(st['state'], st['state'])}")
    if st["mode"]:
        print(f"  Эрхийн төрөл: {mode.get(st['mode'], st['mode'])}")
    if st["expires_at"]:
        end = datetime.fromtimestamp(st["expires_at"]).strftime("%Y-%m-%d %H:%M")
        print(f"  Дуусах огноо: {end}  ({st['days_left']} хоног үлдсэн)")
    print(f"  Машины код  : {st['machine_code']}")
    if st["message"]:
        print(f"  Тайлбар     : {st['message']}")


def cmd_status(_args) -> int:
    st = licensing.status(force=True)
    print(LINE)
    _print_status(st)
    print(LINE)
    return 0 if st["ok"] else 2


def cmd_machine(_args) -> int:
    print(licensing.machine_code())
    return 0


def cmd_activate(args) -> int:
    if args.key:
        try:
            st = licensing.activate(mode="", key=args.key)
        except licensing.LicenseError as exc:
            print(f"  [X] {exc}")
            return 1
        print("  [OK] Эрх амжилттай нээгдлээ.")
        _print_status(st)
        return 0

    if args.mode not in ("trial", "full"):
        print("  [X] --mode нь trial эсвэл full байх ёстой.")
        return 1
    if args.mode == "trial" and not (1 <= args.days <= 3650):
        print("  [X] --days нь 1-3650 хоногийн хооронд байх ёстой.")
        return 1

    print()
    if args.mode == "trial":
        print(f"  Сонголт: {args.days} хоногийн туршилтын эрх")
    else:
        print("  Сонголт: Бүрэн эрх (хугацаагүй)")
    print()

    password = args.password or _ask_password("  Мастер нууц үг: ")
    print("  Шалгаж байна...")
    try:
        st = licensing.activate(mode=args.mode, days=args.days, password=password)
    except licensing.LicenseError as exc:
        print(f"  [X] {exc}")
        return 1

    print("  [OK] Эрх амжилттай нээгдлээ.")
    print()
    _print_status(st)
    return 0


# ── Харилцан ярианы урсгалууд ───────────────────────────
def _try_activate(**kwargs) -> bool:
    """Эрх нээхийг оролдоод үр дүнг хэвлэнэ."""
    print("  Шалгаж байна...")
    try:
        st = licensing.activate(**kwargs)
    except licensing.LicenseError as exc:
        print(f"  [X] {exc}\n")
        return False
    print("  [OK] Эрх амжилттай нээгдлээ.\n")
    _print_status(st)
    return True


def _flow_trial() -> bool:
    days = _ask_days()
    print()
    return _try_activate(mode="trial", days=days,
                         password=_ask_password("  Мастер нууц үг: "))


def _flow_full() -> bool:
    print("\n  Бүрэн эрх — хугацаагүй\n")
    return _try_activate(mode="full",
                         password=_ask_password("  Мастер нууц үг: "))


def _flow_key() -> bool:
    print()
    print("  Үйлчилгээ үзүүлэгчээс ирсэн түлхүүрээ буулгана уу")
    print("  (баруун товшоод Paste, дараа нь Enter):")
    print()
    key = _ask("  Түлхүүр: ")
    if not key:
        return False
    print()
    return _try_activate(mode="", key=key)


def _flow_keygen() -> bool:
    """Өөр компьютерт зориулсан идэвхжүүлэх түлхүүр үүсгэх."""
    from licensing import grant as grant_mod
    from licensing import hwid

    print()
    code = _ask("  Хэрэглэгчийн МАШИНЫ КОД: ")
    if not code:
        return False
    try:
        hw = hwid.parse_machine_code(code)
    except Exception as exc:
        print(f"  [X] Машины код буруу байна: {exc}\n")
        return False

    print()
    print("    1) Туршилтын хугацаа (хоногоор)")
    print("    2) Бүрэн эрх (хугацаагүй)")
    pick = _ask("  Сонголт [1/2]: ", "1")
    if pick == "2":
        mode, days = grant_mod.MODE_FULL, 0
    else:
        mode, days = grant_mod.MODE_TRIAL, _ask_days(30)

    print()
    try:
        private_key = vault.unlock(_ask_password("  Мастер нууц үг: "))
    except vault.VaultError as exc:
        print(f"  [X] {exc}\n")
        return False

    g = grant_mod.build(mode, days, hw, private_key)
    key = g.to_key()

    print()
    print(LINE)
    if g.expires_at:
        end = datetime.fromtimestamp(g.expires_at).strftime("%Y-%m-%d %H:%M")
        print(f"  {days} хоногийн эрх — {end} хүртэл")
    else:
        print("  Бүрэн эрх — хугацаагүй")
    print(LINE)
    print()
    print("  Доорх түлхүүрийг хэрэглэгч рүү илгээнэ үү:")
    print()
    for i in range(0, len(key), 45):
        print("   ", key[i:i + 45])
    print()

    out = Path(__file__).resolve().parent.parent / "tools" / \
        f"key_{code.replace('-', '')[:8]}.txt"
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(key, encoding="utf-8")
        print(f"  (Хуулбар хадгаллаа: tools/{out.name})")
    except OSError:
        pass
    return True


def cmd_wizard(_args) -> int:
    """Суулгацын үеийн эрх нээх урсгал — install.bat ашиглана."""
    if licensing.status(force=True)["ok"]:
        print("  [OK] Энэ компьютерт эрх аль хэдийн нээгдсэн байна.\n")
        return cmd_status(_args)

    try:
        for _ in range(10):
            print("------------------------------------------------")
            print("  АШИГЛАХ ХУГАЦААГ СОНГОНО УУ")
            print("------------------------------------------------")
            print("   1) Туршилтын хугацаа  (хоногоор — жишээ нь 7)")
            print("   2) Бүрэн эрх          (хугацаагүй)")
            print("   3) Идэвхжүүлэх түлхүүр буулгах")
            print()
            pick = _ask("  Сонголт [1/2/3]: ")

            if pick == "1" and _flow_trial():
                return 0
            if pick == "2" and _flow_full():
                return 0
            if pick == "3" and _flow_key():
                return 0
            if pick not in ("1", "2", "3"):
                print("  [!] 1, 2 эсвэл 3 гэж оруулна уу.\n")
    except Cancelled:
        pass

    print()
    print("  [!] Лицензийг алгаслаа. Суулгац дууссаны дараа")
    print("      License.bat -г ажиллуулж хугацаагаа тохируулна уу.")
    return 0


def cmd_menu(_args) -> int:
    """Бүрэн удирдлагын цэс — License.bat ашиглана."""
    actions = {
        "1": _flow_trial,
        "2": _flow_full,
        "3": _flow_key,
        "4": _flow_keygen,
    }
    try:
        while True:
            print()
            print(LINE)
            print("  LAUNDRY POS — ЛИЦЕНЗИЙН УДИРДЛАГА")
            print(LINE)
            _print_status(licensing.status(force=True))
            print("------------------------------------------------")
            print("   1) Хугацаатай эрх нээх    (хоногоор)")
            print("   2) Бүрэн эрх нээх         (хугацаагүй)")
            print("   3) Идэвхжүүлэх түлхүүр буулгах")
            print("   4) Өөр компьютерт түлхүүр үүсгэх")
            print("   5) Гарах")
            print()
            pick = _ask("  Сонголт [1-5]: ")
            if pick == "5":
                return 0
            action = actions.get(pick)
            if action is None:
                print("  [!] 1-5 хооронд сонгоно уу.")
                continue
            action()
            _ask("  Үргэлжлүүлэхийн тулд Enter дарна уу...")
    except Cancelled:
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Laundry POS лицензийн хэрэгсэл")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("setup", help="Анхны тохиргоо — мастер нууц үг үүсгэх")
    sub.add_parser("wizard", help="Суулгацын үеийн эрх нээх урсгал")
    sub.add_parser("menu", help="Бүрэн удирдлагын цэс")
    sub.add_parser("status", help="Лицензийн төлөв харах")
    sub.add_parser("machine", help="Машины код харах")

    act = sub.add_parser("activate", help="Эрх нээх")
    act.add_argument("--mode", default="trial", choices=["trial", "full"])
    act.add_argument("--days", type=int, default=7)
    act.add_argument("--key", default="", help="Алсаас өгсөн идэвхжүүлэх түлхүүр")
    act.add_argument("--password", default="", help="Мастер нууц үг (аюулгүй биш)")

    args = parser.parse_args()
    handlers = {
        "setup": cmd_setup,
        "wizard": cmd_wizard,
        "menu": cmd_menu,
        "status": cmd_status,
        "machine": cmd_machine,
        "activate": cmd_activate,
    }
    handler = handlers.get(args.cmd)
    if handler is None:
        parser.print_help()
        return 1
    try:
        return handler(args)
    except Cancelled:
        print("\nЦуцаллаа.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
