"""Анхны тохиргоо — мастер нууц үг ба лицензийн түлхүүрийн хос үүсгэнэ.

НЭГ Л УДАА, зөвхөн эзэмшигчийн компьютер дээр ажиллуулна.

    python tools/vendor_setup.py

Үүссэн 2 файлыг git-д commit хийнэ:
    backend/licensing/vault.dat        (шифрлэгдсэн хувийн түлхүүр)
    backend/licensing/pubkey_data.py   (нийтийн түлхүүр)
"""

import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.argv = ["license_cli.py", "setup"]

runpy.run_path(str(ROOT / "backend" / "license_cli.py"), run_name="__main__")
