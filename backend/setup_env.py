"""`.env` файлыг анх удаа бэлтгэх — install.bat дуудна.

Хамгийн чухал нь SECRET_KEY: энэ бол нэвтрэх токен (JWT) гарын үсэг
зурах түлхүүр. Хоосон орхивол код доторх нийтлэг утга ашиглагдах тул
БҮХ суулгац ижил түлхүүртэй болно — тэр утгыг мэдсэн хүн ямар ч
компьютерын админ токен хуурамчаар үйлдэж чадна.

Тиймээс суулгах бүрд санамсаргүй шинэ түлхүүр үүсгэнэ.

Ажиллагаа:
  * `.env` байхгүй бол `.env.example`-ээс хуулж, SECRET_KEY-г бөглөнө
  * `.env` байгаа ч SECRET_KEY хоосон бол зөвхөн түүнийг нөхнө
  * Аль хэдийн утгатай бол юу ч хийхгүй (дахин суулгахад токен хүчинтэй үлдэнэ)
"""

import io
import re
import secrets
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV_PATH = HERE / ".env"
EXAMPLE_PATH = HERE / ".env.example"

if sys.platform == "win32":
    stream = sys.stdout
    if (getattr(stream, "encoding", "") or "").lower().replace("-", "") != "utf8":
        sys.stdout = io.TextIOWrapper(
            stream.buffer, encoding="utf-8", errors="replace"
        )

_KEY_RE = re.compile(r"""^\s*SECRET_KEY\s*=\s*(.*?)\s*$""", re.MULTILINE)


def _is_blank(raw: str) -> bool:
    return raw.strip().strip("'\"") == ""


def main() -> int:
    if ENV_PATH.exists():
        text = ENV_PATH.read_text(encoding="utf-8", errors="replace")
        match = _KEY_RE.search(text)
        if match and not _is_blank(match.group(1)):
            print("  [OK] .env бэлэн (SECRET_KEY тохируулагдсан)")
            return 0
        key = secrets.token_urlsafe(48)
        if match:
            text = text[:match.start()] + f"SECRET_KEY='{key}'" + text[match.end():]
        else:
            text = text.rstrip("\n") + f"\n\nSECRET_KEY='{key}'\n"
        ENV_PATH.write_text(text, encoding="utf-8")
        print("  [OK] .env дэх SECRET_KEY-г шинээр үүсгэлээ")
        return 0

    if not EXAMPLE_PATH.exists():
        print("  [!] .env.example олдсонгүй — .env үүсгэсэнгүй")
        return 0

    text = EXAMPLE_PATH.read_text(encoding="utf-8", errors="replace")
    key = secrets.token_urlsafe(48)
    if _KEY_RE.search(text):
        text = _KEY_RE.sub(f"SECRET_KEY='{key}'", text, count=1)
    else:
        text = text.rstrip("\n") + f"\n\nSECRET_KEY='{key}'\n"
    ENV_PATH.write_text(text, encoding="utf-8")
    print("  [OK] .env үүсгэж, нууц түлхүүрийг санамсаргүй гаргалаа")
    return 0


if __name__ == "__main__":
    sys.exit(main())
