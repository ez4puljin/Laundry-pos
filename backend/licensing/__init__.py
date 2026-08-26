"""Laundry POS — лицензийн хамгаалалт.

Хэрэглээ:
    from licensing import status, activate, is_ok, machine_code
"""

from .core import (
    ACTIVE,
    BROKEN,
    EXPIRED,
    MISMATCH,
    TAMPERED,
    UNLICENSED,
    LicenseError,
    activate,
    invalidate,
    is_ok,
    status,
)
from .hwid import machine_code
from .vault import MIN_PASSWORD_LEN, VaultError

__all__ = [
    "ACTIVE", "BROKEN", "EXPIRED", "MISMATCH", "TAMPERED", "UNLICENSED",
    "LicenseError", "VaultError", "MIN_PASSWORD_LEN",
    "activate", "invalidate", "is_ok", "status", "machine_code",
]
