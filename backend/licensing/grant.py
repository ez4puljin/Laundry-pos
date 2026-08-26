"""Лицензийн эрх (grant) — Ed25519 гарын үсэгтэй хоёртын бичлэг.

Бүтэц (104 байт):
    0   2   magic  b'CL'
    2   1   ver    = 1
    3   1   mode   1=trial, 2=full
    4   4   iss    олгосон цаг (unix, uint32 LE)
    8   4   exp    дуусах цаг (unix, 0 = хугацаагүй)
    12  8   sid    санамсаргүй суулгацын ID
    20  20  hw     машины хурууны хээ
    ── дээрх 40 байтыг гарын үсэг зурна ──
    40  64  sig    Ed25519 гарын үсэг

Гарын үсгийг зөвхөн мастер нууц үгээр нээгддэг хувийн түлхүүр зурж чадна.
Тиймээс эрхийг ХУУРАМЧААР ҮЙЛДЭХ боломжгүй — зөвхөн кодыг өөрчилж
шалгалтыг тойрох л боломжтой (үүнээс module-г compile хийж хамгаална).
"""

import base64
import os
import struct
import time
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from . import hwid

MAGIC = b"CL"
VERSION = 1
MODE_TRIAL = 1
MODE_FULL = 2

_BODY_FMT = "<2sBBII8s20s"
BODY_LEN = struct.calcsize(_BODY_FMT)  # 40
SIG_LEN = 64
GRANT_LEN = BODY_LEN + SIG_LEN  # 104


class GrantError(Exception):
    pass


@dataclass(frozen=True)
class Grant:
    mode: int
    issued_at: int
    expires_at: int          # 0 = хугацаагүй
    sid: bytes
    hw: bytes
    raw: bytes               # 104 байт бүтэн бичлэг

    @property
    def is_full(self) -> bool:
        return self.mode == MODE_FULL

    @property
    def signature(self) -> bytes:
        return self.raw[BODY_LEN:]

    def to_key(self) -> str:
        """Сүлжээгээр дамжуулах текст түлхүүр (base32, 8-8 бүлэглэсэн)."""
        text = base64.b32encode(self.raw).decode().rstrip("=")
        return "-".join(text[i:i + 8] for i in range(0, len(text), 8))


def build(mode: int, days: int, hw: bytes, private_key: Ed25519PrivateKey,
          issued_at: int = None) -> Grant:
    """Шинэ эрх үүсгэж гарын үсэг зурна (зөвхөн мастер нууц үгтэй үед)."""
    if mode not in (MODE_TRIAL, MODE_FULL):
        raise GrantError("Эрхийн төрөл буруу байна")
    if len(hw) != hwid.HW_LEN:
        raise GrantError("Машины хээ буруу урттай байна")

    issued_at = int(issued_at if issued_at is not None else time.time())
    if mode == MODE_FULL:
        expires_at = 0
    else:
        if days < 1 or days > 3650:
            raise GrantError("Туршилтын хугацаа 1-3650 хоногийн хооронд байна")
        expires_at = issued_at + days * 86400

    sid = os.urandom(8)
    body = struct.pack(_BODY_FMT, MAGIC, VERSION, mode, issued_at, expires_at, sid, hw)
    sig = private_key.sign(body)
    return Grant(mode, issued_at, expires_at, sid, hw, body + sig)


def parse(raw: bytes, public_key: Ed25519PublicKey) -> Grant:
    """Хоёртын бичлэгийг задалж гарын үсгийг шалгана. Буруу бол GrantError."""
    if not raw or len(raw) != GRANT_LEN:
        raise GrantError("Эрхийн бичлэг гэмтсэн байна")

    body, sig = raw[:BODY_LEN], raw[BODY_LEN:]
    try:
        public_key.verify(sig, body)
    except InvalidSignature:
        raise GrantError("Эрхийн гарын үсэг хүчингүй байна")

    magic, ver, mode, iss, exp, sid, hw = struct.unpack(_BODY_FMT, body)
    if magic != MAGIC or ver != VERSION:
        raise GrantError("Эрхийн хувилбар танигдсангүй")
    if mode not in (MODE_TRIAL, MODE_FULL):
        raise GrantError("Эрхийн төрөл танигдсангүй")

    return Grant(mode, iss, exp, sid, hw, raw)


def from_key(text: str, public_key: Ed25519PublicKey) -> Grant:
    """Хэрэглэгчийн буулгасан текст түлхүүрийг задлах."""
    clean = "".join(ch for ch in (text or "").upper() if ch.isalnum())
    if not clean:
        raise GrantError("Идэвхжүүлэх түлхүүр хоосон байна")
    try:
        raw = base64.b32decode(clean + "=" * (-len(clean) % 8))
    except Exception:
        raise GrantError("Идэвхжүүлэх түлхүүр буруу форматтай байна")
    return parse(raw, public_key)
