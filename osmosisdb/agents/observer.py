"""Query Observer Agent — enriches and validates query stream."""

from __future__ import annotations

import logging
from osmosisdb.analysis.parser import extract_metadata
from osmosisdb.analysis.fingerprint import fingerprint

logger = logging.getLogger(__name__)


class QueryObserverAgent:
    """Agent responsible for checking query validity and logging stats."""

    def __init__(self) -> None:
        pass

    def observe(self, sql: str) -> dict | None:
        """Validate and enrich raw query statement. Returns None if invalid."""
        if not sql or not sql.strip():
            return None

        # Clean/validate query format
        sql_clean = sql.strip()

        # Parse structural metadata
        meta = extract_metadata(sql_clean)
        
        # Check if query is a table-targeting DML/DQL statement
        upper_sql = sql_clean.upper()
        is_dml = any(upper_sql.startswith(kw) for kw in ["SELECT", "INSERT", "UPDATE", "DELETE", "MERGE", "COPY"])

        if not meta.tables and not is_dml:
            # We filter out boilerplate transaction or connection commands (BEGIN, COMMIT, SHOW, SET)
            return None

        fp = fingerprint(sql_clean)

        return {
            "sql": sql_clean,
            "fingerprint": fp,
            "tables": meta.tables,
            "filter_columns": meta.filter_columns,
            "join_columns": meta.join_columns,
            "order_columns": meta.order_columns,
        }
