"""PostgreSQL catalog introspection using psycopg."""

from __future__ import annotations

import logging
import psycopg

logger = logging.getLogger(__name__)


class PostgresCatalog:
    """Introspects PostgreSQL schema, indexes, and statistics."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def get_existing_indexes(self) -> list[dict]:
        """Fetch all user indexes from pg_indexes."""
        query = """
            SELECT tablename, indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
        """
        try:
            with psycopg.connect(self._dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute(query)
                    return [
                        {"table": row[0], "name": row[1], "definition": row[2]}
                        for row in cur.fetchall()
                    ]
        except Exception as e:
            logger.warning("PG catalog query failed (get_existing_indexes): %s", e)
            return []

    def get_index_usage_stats(self) -> list[dict]:
        """Fetch index usage statistics from pg_stat_user_indexes."""
        query = """
            SELECT relname, indexrelname, idx_scan
            FROM pg_stat_user_indexes
            WHERE schemaname = 'public'
        """
        try:
            with psycopg.connect(self._dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute(query)
                    return [
                        {"table": row[0], "name": row[1], "scans": row[2]}
                        for row in cur.fetchall()
                    ]
        except Exception as e:
            logger.warning("PG catalog query failed (get_index_usage_stats): %s", e)
            return []

    def get_table_stats(self) -> list[dict]:
        """Fetch table scan statistics to identify high sequential scans."""
        query = """
            SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
        """
        try:
            with psycopg.connect(self._dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute(query)
                    return [
                        {
                            "table": row[0],
                            "seq_scans": row[1],
                            "seq_tup_read": row[2],
                            "idx_scans": row[3],
                            "idx_tup_fetch": row[4],
                        }
                        for row in cur.fetchall()
                    ]
        except Exception as e:
            logger.warning("PG catalog query failed (get_table_stats): %s", e)
            return []
