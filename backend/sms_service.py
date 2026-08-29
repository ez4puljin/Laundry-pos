"""
SMS мэдэгдэл илгээх сервис
Android SMS Gateway ашиглана: https://github.com/capcom6/android-sms-gateway
"""
import os
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("sms")


def _get_sms_config():
    """Нөөц тохиргоо. Ердийн үед дуудагч нь САЛБАРЫН тохиргоог дамжуулна
    (settings_store.sms_config) — salbar бүр өөрийн gateway-тэй байж болно."""
    return {
        "url": os.getenv("SMS_GATEWAY_URL", "http://192.168.1.71:8080"),
        "username": os.getenv("SMS_GATEWAY_USERNAME", "sms"),
        "password": os.getenv("SMS_GATEWAY_PASSWORD", ""),
        "enabled": os.getenv("SMS_ENABLED", "true").lower() == "true",
        "template": os.getenv(
            "SMS_TEMPLATE",
            "Таны угаалга бэлэн боллоо."
        ),
    }


def _format_phone(phone: str) -> str:
    """Монгол дугаарыг олон улсын форматад оруулах (+976XXXXXXXX)"""
    phone = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone.startswith("+976"):
        return phone
    if phone.startswith("976") and len(phone) == 11:
        return "+" + phone
    if len(phone) == 8:
        return "+976" + phone
    return phone


def send_ready_sms(phone: str, order_number: str = "", config: dict = None) -> bool:
    """
    Захиалга бэлэн болсон үед SMS явуулах.
    `config` — салбарын тохиргоо (settings_store.sms_config). Өгөөгүй бол
    .env-ийн нөөц утгыг ашиглана.
    Амжилттай бол True, алдаа гарвал False буцаана.
    """
    cfg = config or _get_sms_config()

    if not cfg["enabled"]:
        log.info(f"[SMS] Disabled - not sent ({phone})")
        return False

    if not cfg["password"]:
        log.info("[SMS] No password configured - not sent")
        return False

    formatted = _format_phone(phone)
    message   = cfg["template"]

    try:
        resp = requests.post(
            f"{cfg['url']}/message",
            auth=(cfg["username"], cfg["password"]),
            json={
                "textMessage": {"text": message},
                "phoneNumbers": [formatted],
            },
            timeout=5,
        )

        if resp.status_code in (200, 201, 202):
            log.info(f"[SMS] OK -> {formatted}  order: {order_number}")
            return True
        else:
            log.info(f"[SMS] Error {resp.status_code}: {resp.text}")
            return False

    except requests.exceptions.ConnectionError:
        log.info(f"[SMS] Gateway connection failed ({cfg['url']})")
        return False
    except requests.exceptions.Timeout:
        log.info("[SMS] Gateway timeout (5s)")
        return False
    except Exception as e:
        log.info(f"[SMS] Error: {e}")
        return False
