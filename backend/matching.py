from __future__ import annotations

import html
import re
import time
from typing import Any

NON_PRIMARY_STEAM_TITLE_PATTERNS = (
    r"\bdemo\b",
    r"\bbeta\b",
    r"\bplaytest\b",
    r"\bprototype\b",
    r"\bsoundtrack\b",
    r"\bost\b",
    r"\bseason\s+pass\b",
    r"\bdlc\b",
    r"\bpack\b",
    r"\bbundle\b",
    r"\bartbook\b",
    r"\bart\s+book\b",
    r"\btrailer\b",
    r"\bdedicated\s+server\b",
    r"\bserver\b",
    r"\btest\b",
)


def normalise_match_title(title: str) -> str:
    text = html.unescape(str(title or "")).casefold()
    text = re.sub(r"[\u2122\u00ae\u00a9]", "", text)
    text = re.sub(r"\[[^\]]+\]|\([^\)]*\)", " ", text)
    text = re.sub(r"\b(the|a|an)\b", " ", text)
    text = re.sub(r"\b(remaster(ed)?|hd|definitive|ultimate|complete|goty|edition)\b", " ", text)
    text = re.sub(
        r"\b(usa|europe|eur|japan|jp|world|rev|revision|beta|proto|prototype|demo|sample|en|fr|de|es|it|pt|br|v\d+(?:\.\d+)*)\b",
        " ",
        text,
    )
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def is_non_primary_steam_title(name: str) -> bool:
    text = html.unescape(str(name or "")).casefold()
    return any(re.search(pattern, text, re.I) for pattern in NON_PRIMARY_STEAM_TITLE_PATTERNS)


def distinctive_tokens_present(query_norm: str, candidate_norm: str) -> bool:
    query_tokens = set(str(query_norm or "").split())
    candidate_tokens = set(str(candidate_norm or "").split())
    distinctive = {
        token
        for token in query_tokens
        if len(token) >= 3 or re.fullmatch(r"\d+", token)
    }
    return distinctive.issubset(candidate_tokens)


def reasonable_match(query: str, title: str) -> bool:
    q = set(re.findall(r"[a-z0-9]+", query.casefold()))
    t = set(re.findall(r"[a-z0-9]+", str(title).casefold()))
    if not q or not t:
        return False
    if q.issubset(t) or t.issubset(q):
        return True
    overlap = len(q.intersection(t)) / max(len(q), 1)
    return overlap >= 0.55


def ign_title_acceptable(query: str, candidate_title: str) -> bool:
    if not reasonable_match(query, candidate_title):
        return False
    query_norm = normalise_match_title(query)
    candidate_norm = normalise_match_title(candidate_title)
    return distinctive_tokens_present(query_norm, candidate_norm)


def clean_html_text(value: str) -> str:
    text = str(value or "")
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()


def clean_game_title(name: str) -> str:
    text = html.unescape(str(name or ""))
    text = re.sub(r"[\u2122\u00ae\u00a9]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def rating_to_percent(value: Any) -> int | None:
    if value is None:
        return None
    try:
        number = float(value)
    except Exception:
        return None
    if number <= 10:
        number *= 10
    return max(0, min(int(round(number)), 100))


def date_to_epoch(value: Any) -> int:
    if not value:
        return 0
    text = str(value).strip()
    formats = ["%Y-%m-%d", "%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y"]
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}T.*", text):
            text = text[:10]
        for fmt in formats:
            try:
                return int(time.mktime(time.strptime(text, fmt)))
            except Exception:
                pass
    except Exception:
        return 0
    return 0


def safe_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value).replace(",", "")))
    except Exception:
        return None


def as_number(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def https_url(value: str) -> str:
    text = str(value or "").strip()
    if text.startswith("//"):
        return "https:" + text
    if text.startswith("http://"):
        return "https://" + text[7:]
    return text
