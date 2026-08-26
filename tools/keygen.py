"""ИДЭВХЖҮҮЛЭХ ТҮЛХҮҮР ҮҮСГЭГЧ — зөвхөн эзэмшигчийн компьютер дээр.

Хэрэглэгч рүү очиж мастер нууц үг оруулах шаардлагагүйгээр, алсаас
(утас/чат) эрх нээх боломж олгоно:

  1. Хэрэглэгч түгжигдсэн дэлгэц дээрх МАШИНЫ КОДЫГ уншуулна.
  2. Та энэ хэрэгслийг ажиллуулж түлхүүр үүсгэнэ.
  3. Түлхүүрийг хэрэглэгч рүү илгээнэ — тэр буулгаад л эрх нээгдэнэ.

Түлхүүр нь ЗӨВХӨН тухайн машин дээр ажиллана. Хуулбарлаж өөр
компьютерт ашиглах боломжгүй.

Ажиллуулах:
    python tools/keygen.py

(License.bat → «4) Өөр компьютерт түлхүүр үүсгэх» нь мөн ижил зүйл хийнэ.)
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import license_cli  # noqa: E402


def main() -> int:
    print("=" * 52)
    print("  ИДЭВХЖҮҮЛЭХ ТҮЛХҮҮР ҮҮСГЭХ")
    print("=" * 52)

    from licensing import vault

    if not vault.exists():
        print("\n  [X] Лицензийн түлхүүр тохируулаагүй байна.")
        print("      Эхлээд License.bat -г ажиллуулна уу.")
        return 1

    try:
        return 0 if license_cli._flow_keygen() else 1
    except license_cli.Cancelled:
        print("\nЦуцаллаа.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
