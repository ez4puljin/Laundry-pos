"""Кирилл → латин хөрвүүлэлт (зөвхөн КОНСОЛЫН гаралтад).

Яагаад хэрэгтэй вэ:
    Windows-ийн консол растер (bitmap) фонттой үед кирилл үсгийг
    дүрсэлж чаддаггүй тул бүгдийг `?` болгодог. Энэ нь `chcp 65001`
    хийсэн ч, скрипт зөв UTF-8 гаргаж байсан ч тохиолддог — учир нь
    асуудал нь кодчилолд биш, ФОНТОД байдаг.

    Тиймээс консолд гарах бүх текстийг латинаар бичнэ. Хөтчид
    харагдах текст (LicenseGate, API-ийн мессеж) кирилл хэвээр
    үлдэнэ — хөтөч ямар ч фонтоор кирилл дүрсэлж чадна.

Хэрэглээ:
    from licensing.translit import latin
    print(latin("Туршилтын хугацаа"))   # -> "Turshiltyn hugatsaa"
"""

import re

# Монгол кирилл цагаан толгой. Олон үсэгт хөрвүүлэлтийг (Ш→Sh) том
# үсгээр бичигдсэн үгэнд бүхэлд нь том болгоно (ШАЛГАХ → SHALGAH).
_MAP = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e",
    "ё": "yo", "ж": "j", "з": "z", "и": "i", "й": "i", "к": "k",
    "л": "l", "м": "m", "н": "n", "о": "o", "ө": "o", "п": "p",
    "р": "r", "с": "s", "т": "t", "у": "u", "ү": "u", "ф": "f",
    "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "i", "э": "e", "ю": "yu", "я": "ya",
}
# Том үсгийн хувилбар: утгыг нь эхний үсгээр нь томсгоно (Ш → Sh, Л → L).
# Бүтэн том үсэгтэй үг тохиолдвол доорх _word() бүхэлд нь томсгоно.
_MAP.update({k.upper(): v.capitalize() for k, v in _MAP.items()})

# Консолд найдваргүй бусад тэмдэгтүүд
_PUNCT = {
    "—": "-", "–": "-", "―": "-",
    "“": '"', "”": '"', "„": '"',
    "‘": "'", "’": "'",
    "…": "...", "№": "No", "•": "*",
    " ": " ",
}

_WORD_SPLIT = re.compile(r"(\W+)", re.UNICODE)


def _word(word: str) -> str:
    """Нэг үгийг хөрвүүлэх. Бүтэн том үсэгтэй бол үр дүнг ч том болгоно."""
    all_caps = len(word) > 1 and word.isupper()
    out = []
    for ch in word:
        rep = _MAP.get(ch)
        if rep is None:
            out.append(ch)
        elif all_caps:
            out.append(rep.upper())
        else:
            out.append(rep)
    return "".join(out)


def latin(text) -> str:
    """Кирилл текстийг консолд аюулгүй латин болгоно."""
    if not isinstance(text, str):
        text = str(text)
    if text.isascii():
        return text

    text = "".join(_PUNCT.get(ch, ch) for ch in text)
    if text.isascii():
        return text

    return "".join(
        part if idx % 2 else _word(part)
        for idx, part in enumerate(_WORD_SPLIT.split(text))
    )
