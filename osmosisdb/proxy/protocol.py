"""PostgreSQL wire protocol message parser.

Parses just enough of the PG v3 protocol to extract SQL text from Simple Query
('Q') and Extended Query Parse ('P') messages. Everything else passes through
untouched.

Protocol reference: https://www.postgresql.org/docs/current/protocol-message-formats.html
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from enum import IntEnum


class MsgType(IntEnum):
    """Frontend (client→server) message types we care about."""

    QUERY = ord("Q")
    PARSE = ord("P")


class BackendMsgType(IntEnum):
    """Backend (server→client) message types we care about."""

    COMMAND_COMPLETE = ord("C")
    ERROR_RESPONSE = ord("E")
    READY_FOR_QUERY = ord("Z")


@dataclass(slots=True)
class PGMessage:
    """A single PostgreSQL protocol message."""

    msg_type: int
    payload: bytes


def parse_message(data: bytes, offset: int = 0) -> tuple[PGMessage | None, int]:
    """Parse one PG message from *data* starting at *offset*.

    Returns (message, bytes_consumed). Returns (None, 0) if data is incomplete.
    A PG message is: 1-byte type + 4-byte length (includes self) + payload.
    """
    remaining = len(data) - offset
    if remaining < 5:
        return None, 0

    msg_type = data[offset]
    (length,) = struct.unpack_from("!I", data, offset + 1)

    total = 1 + length  # type byte + length field + payload
    if remaining < total:
        return None, 0

    payload = data[offset + 5 : offset + 1 + length]
    return PGMessage(msg_type, payload), total


def extract_sql(msg: PGMessage) -> str | None:
    """Extract SQL text from a Query or Parse message. Returns None for other types."""
    if msg.msg_type == MsgType.QUERY:
        # Simple Query: payload is the SQL string terminated by \x00
        return msg.payload.rstrip(b"\x00").decode("utf-8", errors="replace")

    if msg.msg_type == MsgType.PARSE:
        # Parse: payload = name\x00 + query\x00 + param_count(2) + param_oids...
        try:
            first_null = msg.payload.index(b"\x00")
            rest = msg.payload[first_null + 1 :]
            second_null = rest.index(b"\x00")
            return rest[:second_null].decode("utf-8", errors="replace")
        except (ValueError, UnicodeDecodeError):
            return None

    return None


def is_startup_message(data: bytes) -> bool:
    """Check if data starts with a PG startup/SSL message (no type byte, just length + protocol)."""
    if len(data) < 8:
        return False
    (length,) = struct.unpack_from("!I", data, 0)
    if length < 8:
        return False
    (code,) = struct.unpack_from("!I", data, 4)
    return code in (196608, 80877103, 80877102)
