"""SQLite storage layer with WAL mode and buffered batch writes."""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
import numpy as np

logger = logging.getLogger(__name__)

DB_PATH = Path.home() / ".osmosisdb.sqlite"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS query_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sql TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    tables TEXT NOT NULL DEFAULT '[]',
    filter_columns TEXT NOT NULL DEFAULT '[]',
    join_columns TEXT NOT NULL DEFAULT '[]',
    order_columns TEXT NOT NULL DEFAULT '[]',
    latency_ms REAL NOT NULL DEFAULT 0,
    timestamp REAL NOT NULL,
    client_addr TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_query_log_fingerprint ON query_log(fingerprint);
CREATE INDEX IF NOT EXISTS idx_query_log_timestamp ON query_log(timestamp);

CREATE TABLE IF NOT EXISTS optimization_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    optimization_type TEXT NOT NULL,
    ddl TEXT NOT NULL,
    rollback_ddl TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    expected_improvement_ms REAL DEFAULT 0,
    write_amplification REAL DEFAULT 0,
    risk_score REAL DEFAULT 0,
    confidence_score REAL DEFAULT 0,
    explain_before TEXT DEFAULT '',
    explain_after TEXT DEFAULT '',
    benchmark_p50 REAL,
    benchmark_p95 REAL,
    benchmark_p99 REAL,
    explanation TEXT DEFAULT '',
    representative_sql TEXT DEFAULT '',
    created_at REAL NOT NULL,
    executed_at REAL
);

CREATE TABLE IF NOT EXISTS pattern_clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    member_count INTEGER NOT NULL,
    representative_sql TEXT NOT NULL,
    centroid_embedding BLOB,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS drift_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drift_score REAL NOT NULL,
    emerging_patterns INTEGER NOT NULL DEFAULT 0,
    disappearing_patterns INTEGER NOT NULL DEFAULT 0,
    timestamp REAL NOT NULL
);
"""


class QueryStore:
    """Thread-safe SQLite store for query logs and related data."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self._db_path = db_path
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        
        # Migration: add representative_sql column if it doesn't exist
        try:
            self._conn.execute("ALTER TABLE optimization_log ADD COLUMN representative_sql TEXT DEFAULT ''")
            self._conn.commit()
        except sqlite3.OperationalError:
            pass

    def insert_queries(self, rows: list[dict]) -> None:
        """Batch insert query records."""
        self._conn.executemany(
            """INSERT INTO query_log
               (sql, fingerprint, tables, filter_columns, join_columns, order_columns,
                latency_ms, timestamp, client_addr)
               VALUES (:sql, :fingerprint, :tables, :filter_columns, :join_columns,
                       :order_columns, :latency_ms, :timestamp, :client_addr)""",
            [
                {
                    **r,
                    "tables": json.dumps(r["tables"]),
                    "filter_columns": json.dumps(r["filter_columns"]),
                    "join_columns": json.dumps(r["join_columns"]),
                    "order_columns": json.dumps(r["order_columns"]),
                }
                for r in rows
            ],
        )
        self._conn.commit()

    def get_recent_queries(self, limit: int = 100, offset: int = 0) -> list[dict]:
        """Return recent query log entries."""
        cur = self._conn.execute(
            "SELECT * FROM query_log ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for col in ("tables", "filter_columns", "join_columns", "order_columns"):
                d[col] = json.loads(d[col]) if isinstance(d[col], str) else d[col]
            rows.append(d)
        return rows

    def get_queries_since(self, since_ts: float) -> list[dict]:
        """Return all queries since a given timestamp."""
        cur = self._conn.execute(
            "SELECT * FROM query_log WHERE timestamp > ? ORDER BY timestamp",
            (since_ts,),
        )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for col in ("tables", "filter_columns", "join_columns", "order_columns"):
                d[col] = json.loads(d[col]) if isinstance(d[col], str) else d[col]
            rows.append(d)
        return rows

    def get_fingerprints_since(self, since_ts: float) -> list[str]:
        """Return distinct normalized SQL for recent queries."""
        cur = self._conn.execute(
            "SELECT DISTINCT sql FROM query_log WHERE timestamp > ? ORDER BY timestamp",
            (since_ts,),
        )
        return [row[0] for row in cur.fetchall()]

    def insert_pattern_clusters(self, clusters: list[dict]) -> None:
        """Batch insert pattern clusters. Wipes existing ones first to keep only the latest workload map."""
        self._conn.execute("DELETE FROM pattern_clusters")
        self._conn.executemany(
            """INSERT INTO pattern_clusters
               (label, member_count, representative_sql, centroid_embedding, created_at)
               VALUES (:label, :member_count, :representative_sql, :centroid_embedding, :created_at)""",
            [
                {
                    "label": c["label"],
                    "member_count": c["member_count"],
                    "representative_sql": c["representative_sql"],
                    "centroid_embedding": sqlite3.Binary(np.array(c["centroid_embedding"], dtype=np.float32).tobytes()) if c.get("centroid_embedding") else None,
                    "created_at": c["created_at"],
                }
                for c in clusters
            ]
        )
        self._conn.commit()

    def get_recent_clusters(self) -> list[dict]:
        """Return the latest pattern clusters."""
        cur = self._conn.execute(
            "SELECT id, label, member_count, representative_sql, centroid_embedding, created_at FROM pattern_clusters ORDER BY member_count DESC"
        )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            if d["centroid_embedding"]:
                d["centroid_embedding"] = np.frombuffer(d["centroid_embedding"], dtype=np.float32).tolist()
            rows.append(d)
        return rows

    def insert_drift_snapshot(self, snapshot: dict) -> None:
        """Insert a drift timeline snapshot."""
        self._conn.execute(
            """INSERT INTO drift_history
               (drift_score, emerging_patterns, disappearing_patterns, timestamp)
               VALUES (:drift_score, :emerging_patterns, :disappearing_patterns, :timestamp)""",
            snapshot
        )
        self._conn.commit()

    def get_drift_timeline(self, limit: int = 100) -> list[dict]:
        """Return historical drift snapshots, newest first."""
        cur = self._conn.execute(
            "SELECT * FROM drift_history ORDER BY timestamp DESC LIMIT ?",
            (limit,)
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    def insert_recommendations(self, recs: list[dict]) -> None:
        """Batch insert recommendations into optimization_log with status 'pending'."""
        self._conn.executemany(
            """INSERT INTO optimization_log
               (optimization_type, ddl, rollback_ddl, status, expected_improvement_ms,
                write_amplification, risk_score, confidence_score, explanation, representative_sql, created_at)
               VALUES (:optimization_type, :ddl, :rollback_ddl, 'pending', :expected_improvement_ms,
                       :write_amplification, :risk_score, :confidence_score, :explanation, :representative_sql, :created_at)""",
            recs
        )
        self._conn.commit()

    def get_pending_recommendations(self) -> list[dict]:
        """Return all pending recommendations."""
        cur = self._conn.execute(
            "SELECT * FROM optimization_log WHERE status = 'pending' ORDER BY created_at DESC"
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    def get_optimization_log(self) -> list[dict]:
        """Return the entire optimization history."""
        cur = self._conn.execute(
            "SELECT * FROM optimization_log ORDER BY created_at DESC"
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    def get_optimization_by_id(self, opt_id: int) -> dict | None:
        """Retrieve a single optimization log entry by ID."""
        cur = self._conn.execute(
            "SELECT * FROM optimization_log WHERE id = ?",
            (opt_id,)
        )
        row = cur.fetchone()
        if not row:
            return None
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))

    def update_optimization_status(
        self,
        opt_id: int,
        status: str,
        explain_before: str = "",
        explain_after: str = "",
        executed_at: float | None = None,
    ) -> None:
        """Update the status and explain outputs of an optimization log entry."""
        self._conn.execute(
            """UPDATE optimization_log
               SET status = ?, explain_before = ?, explain_after = ?, executed_at = ?
               WHERE id = ?""",
            (status, explain_before, explain_after, executed_at, opt_id)
        )
        self._conn.commit()

    def update_optimization_benchmarks(
        self,
        opt_id: int,
        p50: float,
        p95: float,
        p99: float,
    ) -> None:
        """Update post-optimization benchmark results."""
        self._conn.execute(
            """UPDATE optimization_log
               SET benchmark_p50 = ?, benchmark_p95 = ?, benchmark_p99 = ?
               WHERE id = ?""",
            (p50, p95, p99, opt_id)
        )
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


