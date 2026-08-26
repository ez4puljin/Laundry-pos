"""Мастер нууц үгээр шифрлэгдсэн хувийн түлхүүрийн сан.

`vault.dat` нь Ed25519 хувийн түлхүүрийг AES-256-GCM-ээр шифрлэж хадгална.
Шифрлэлтийн түлхүүр = scrypt(мастер нууц үг, salt).

    salt(16) | nonce(12) | ciphertext(32) + tag(16)   = 76 байт

Ач холбогдол:
  * Нууц үг зөв эсэхийг GCM-ийн баталгаажуулалтаар шалгана — тусад нь
    hash хадгалах шаардлагагүй.
  * Нууц үггүйгээр хувийн түлхүүрийг гаргаж авах боломжгүй тул
    ХУУРАМЧ лиценз үүсгэх боломжгүй.
  * Хамгаалалт нь нууц үгийн хүчнээс шалтгаална — 12+ тэмдэгт шаардана.
"""

from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

import hashlib
import os

_HERE = Path(__file__).resolve().parent
VAULT_PATH = _HERE / "vault.dat"
# Нийтийн түлхүүр нь энгийн файл биш, ҮҮСГЭСЭН PYTHON МОДУЛЬ хэлбэртэй.
# Ингэснээр licensing багцыг .pyd болгож compile хийхэд түлхүүр хамт
# хамгаалагдана — түлхүүрийг сольж өөрийн эрх үүсгэх боломж хаагдана.
PUBKEY_MODULE = _HERE / "pubkey_data.py"

_AAD = b"cemby-pos-vault-v1"
_SALT_LEN = 16
_NONCE_LEN = 12
_SCRYPT_N = 1 << 17     # 128 MB санах ой — GPU-гаар зэрэг таах боломжийг хумина
_SCRYPT_R = 8
_SCRYPT_P = 1
_MAXMEM = 512 * 1024 * 1024

MIN_PASSWORD_LEN = 12
# Урт нууц үг эсвэл олон төрлийн тэмдэгт — аль нэгийг нь хангасан байх ёстой
_STRONG_LEN = 16
_MIN_CLASSES = 3


class VaultError(Exception):
    pass


def _derive(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=32,
        maxmem=_MAXMEM,
    )


_PUBKEY_TEMPLATE = '''"""АВТОМАТААР ҮҮССЭН ФАЙЛ — гараар засаж БОЛОХГҮЙ.

tools/vendor_setup.py үүсгэсэн. Энэ бол Ed25519 НИЙТИЙН түлхүүр бөгөөд
лицензийн гарын үсгийг шалгахад ашиглагдана. Нууц биш ч гэсэн үүнийг
сольсон тохиолдолд өмнө олгосон БҮХ эрх хүчингүй болно.
"""

PUBLIC_KEY_HEX = "{hexkey}"
'''


def check_strength(password: str):
    """Сул нууц үгийг татгалзана. Тохирохгүй бол шалтгааныг буцаана."""
    if len(password) < MIN_PASSWORD_LEN:
        return f"Хамгийн багадаа {MIN_PASSWORD_LEN} тэмдэгт байх ёстой"
    if len(password) >= _STRONG_LEN:
        return None
    classes = sum([
        any(c.islower() for c in password),
        any(c.isupper() for c in password),
        any(c.isdigit() for c in password),
        any(not c.isalnum() for c in password),
    ])
    if classes < _MIN_CLASSES:
        return (
            f"Хэт сул байна. {_STRONG_LEN}+ тэмдэгт болгох, эсвэл жижиг/том "
            "үсэг, тоо, тусгай тэмдэгтээс дор хаяж 3 төрлийг хольж бичнэ үү"
        )
    return None


def exists() -> bool:
    return VAULT_PATH.exists() and PUBKEY_MODULE.exists()


def create(password: str, private_key: Ed25519PrivateKey = None) -> Ed25519PublicKey:
    """Шинэ түлхүүрийн хос үүсгэж vault.dat + pubkey_data.py бичнэ (нэг удаа)."""
    problem = check_strength(password)
    if problem:
        raise VaultError(f"Мастер нууц үг: {problem}")

    private_key = private_key or Ed25519PrivateKey.generate()
    secret = private_key.private_bytes(
        Encoding.Raw, PrivateFormat.Raw, NoEncryption()
    )

    salt = os.urandom(_SALT_LEN)
    nonce = os.urandom(_NONCE_LEN)
    blob = AESGCM(_derive(password, salt)).encrypt(nonce, secret, _AAD)

    pub = private_key.public_key()
    hexkey = pub.public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

    VAULT_PATH.write_bytes(salt + nonce + blob)
    PUBKEY_MODULE.write_text(
        _PUBKEY_TEMPLATE.format(hexkey=hexkey), encoding="utf-8"
    )

    global _pub_cache
    _pub_cache = pub
    return pub


def unlock(password: str) -> Ed25519PrivateKey:
    """Мастер нууц үгээр хувийн түлхүүрийг нээх. Буруу бол VaultError."""
    if not VAULT_PATH.exists():
        raise VaultError(
            "vault.dat олдсонгүй — эрх олгох түлхүүр байхгүй байна. "
            "tools/vendor_setup.py -г ажиллуулна уу."
        )
    data = VAULT_PATH.read_bytes()
    if len(data) < _SALT_LEN + _NONCE_LEN + 16:
        raise VaultError("vault.dat гэмтсэн байна")

    salt = data[:_SALT_LEN]
    nonce = data[_SALT_LEN:_SALT_LEN + _NONCE_LEN]
    blob = data[_SALT_LEN + _NONCE_LEN:]
    try:
        secret = AESGCM(_derive(password, salt)).decrypt(nonce, blob, _AAD)
    except Exception:
        raise VaultError("Мастер нууц үг буруу байна")

    key = Ed25519PrivateKey.from_private_bytes(secret)
    if public_key().public_bytes(Encoding.Raw, PublicFormat.Raw) != \
            key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw):
        raise VaultError("vault.dat болон pubkey_data.py таарахгүй байна")
    return key


_pub_cache = None


def public_key() -> Ed25519PublicKey:
    """Лиценз шалгахад ашиглах нийтийн түлхүүр (нууц биш)."""
    global _pub_cache
    if _pub_cache is None:
        try:
            from .pubkey_data import PUBLIC_KEY_HEX
            raw = bytes.fromhex(PUBLIC_KEY_HEX)
        except ImportError:
            raise VaultError(
                "Лицензийн түлхүүр тохируулаагүй байна. "
                "License.bat -г ажиллуулж мастер нууц үгээ үүсгэнэ үү."
            )
        except ValueError:
            raise VaultError("Лицензийн нийтийн түлхүүр гэмтсэн байна")
        if len(raw) != 32:
            raise VaultError("Лицензийн нийтийн түлхүүр буруу урттай байна")
        _pub_cache = Ed25519PublicKey.from_public_bytes(raw)
    return _pub_cache
