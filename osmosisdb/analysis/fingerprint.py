"""SQL fingerprinting — normalize queries and produce a stable hash."""

from __future__ import annotations

import hashlib
import re


def normalize(sql: str) -> str:
    """Normalize SQL for fingerprinting: lowercase, collapse whitespace, replace literals."""
    s = sql.strip()
    s = re.sub(r"'[^']*'", "'?'", s)
    s = re.sub(r"\b\d+(?:\.\d+)?\b", "?", s)
    s = re.sub(r"\s+", " ", s)
    return s.lower().strip()


def fingerprint(sql: str) -> str:
    """Return a SHA-256 hex digest of the normalized SQL."""
    return hashlib.sha256(normalize(sql).encode("utf-8")).hexdigest()[:16]
