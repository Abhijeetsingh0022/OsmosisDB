"""Heuristic-based optimization recommendation engine."""

from __future__ import annotations

import logging
import re
from osmosisdb.analysis.parser import extract_metadata

logger = logging.getLogger(__name__)

IDENTIFIER_REGEX = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def generate_recommendations(
    clusters: list[dict],
    existing_indexes: list[dict],
    index_usage: list[dict],
    table_stats: list[dict],
) -> list[dict]:
    """Generate rule-based DDL optimization recommendations.

    Args:
        clusters: Current workload pattern clusters.
        existing_indexes: List of existing indexes on tables.
        index_usage: Scan counts for existing indexes.
        table_stats: Table scan statistics (seq_scans, etc.).

    Returns:
        List of recommendation dicts.
    """
    recommendations = []

    # Map existing index details for fast lookup
    # key: (table_name, column_name) -> index definition
    indexed_columns: set[tuple[str, str]] = set()
    for idx in existing_indexes:
        table = idx["table"]
        defn = idx["definition"].lower()
        # Simple heuristic to extract column name from index definition: e.g. "on table (col)"
        if "(" in defn and ")" in defn:
            cols_str = defn.split("(")[-1].split(")")[0]
            # Handle multiple columns or single
            for col in cols_str.replace(" ", "").replace('"', '').split(","):
                indexed_columns.add((table, col))

    # --- Rule 1: CREATE INDEX (Missing index on filter/join columns) ---
    for cluster in clusters:
        sql = cluster["representative_sql"]
        meta = extract_metadata(sql)

        # Check filter columns
        for table, col in meta.table_filter_columns:
            if not IDENTIFIER_REGEX.match(table) or not IDENTIFIER_REGEX.match(col):
                continue
            if (table, col) not in indexed_columns:
                index_name = f"idx_{table}_{col}"
                recommendations.append({
                    "optimization_type": "CREATE_INDEX",
                    "ddl": f'CREATE INDEX CONCURRENTLY "{index_name}" ON "{table}" ("{col}")',
                    "rollback_ddl": f'DROP INDEX CONCURRENTLY IF EXISTS "{index_name}"',
                    "expected_improvement_ms": 25.0,  # heuristic estimation
                    "write_amplification": 1.2,
                    "risk_score": 0.1,
                    "confidence_score": 0.8,
                    "explanation": f"Cluster '{cluster['label']}' frequently filters table '{table}' by column '{col}'. Adding an index will avoid sequential scans.",
                    "representative_sql": sql,
                })
                # Add to temp set to avoid duplicate recommendations in the same run
                indexed_columns.add((table, col))

        # Check join columns
        for table, col in meta.table_join_columns:
            if not IDENTIFIER_REGEX.match(table) or not IDENTIFIER_REGEX.match(col):
                continue
            if (table, col) not in indexed_columns:
                index_name = f"idx_join_{table}_{col}"
                recommendations.append({
                    "optimization_type": "CREATE_INDEX",
                    "ddl": f'CREATE INDEX CONCURRENTLY "{index_name}" ON "{table}" ("{col}")',
                    "rollback_ddl": f'DROP INDEX CONCURRENTLY IF EXISTS "{index_name}"',
                    "expected_improvement_ms": 50.0,
                    "write_amplification": 1.2,
                    "risk_score": 0.1,
                    "confidence_score": 0.85,
                    "explanation": f"Cluster '{cluster['label']}' joins table '{table}' on column '{col}'. Adding an index will speed up join execution.",
                    "representative_sql": sql,
                })
                indexed_columns.add((table, col))

    # --- Rule 2: DROP INDEX (Unused indexes) ---
    # Map index name to scan count
    usage_map = {item["name"]: item["scans"] for item in index_usage}
    for idx in existing_indexes:
        idx_name = idx["name"]
        table = idx["table"]
        # Skip primary key or unique constraint indexes by naming convention or definition
        if "pkey" in idx_name or "unique" in idx_name or idx_name.startswith("pg_") or "unique" in idx.get("definition", "").lower():
            continue

        scans = usage_map.get(idx_name, 0)
        if scans == 0:
            if not IDENTIFIER_REGEX.match(idx_name) or not IDENTIFIER_REGEX.match(table):
                continue
            recommendations.append({
                "optimization_type": "DROP_INDEX",
                "ddl": f'DROP INDEX CONCURRENTLY IF EXISTS "{idx_name}"',
                "rollback_ddl": idx["definition"],  # Rollback is the index creation definition!
                "expected_improvement_ms": 0.0,
                "write_amplification": -0.5,  # negative means write performance improves!
                "risk_score": 0.3,
                "confidence_score": 0.7,
                "explanation": f"Index '{idx_name}' on table '{table}' has not been used for queries (0 scans). Dropping it will decrease write overhead.",
                "representative_sql": f'SELECT * FROM "{table}" LIMIT 10', # fallback check query
            })

    # --- Rule 3: CLUSTER table ---
    for stat in table_stats:
        table = stat["table"]
        # If table has heavy sequential scans (e.g. > 1000) and high tuple reads
        if stat["seq_scans"] > 1000:
            # Find if there is an index we can cluster on
            for idx in existing_indexes:
                if idx["table"] == table:
                    idx_name = idx["name"]
                    if not IDENTIFIER_REGEX.match(table) or not IDENTIFIER_REGEX.match(idx_name):
                        continue
                    recommendations.append({
                        "optimization_type": "CLUSTER",
                        "ddl": f'CLUSTER "{table}" USING "{idx_name}"',
                        "rollback_ddl": "",  # One-time cluster operation, no immediate rollback DDL
                        "expected_improvement_ms": 100.0,
                        "write_amplification": 0.1,
                        "risk_score": 0.8,  # CLUSTER holds an AccessExclusiveLock, high risk!
                        "confidence_score": 0.6,
                        "explanation": f"Table '{table}' has high sequential scan counts ({stat['seq_scans']}). Clustering it using index '{idx_name}' will optimize sequential range accesses.",
                        "representative_sql": f'SELECT * FROM "{table}" LIMIT 100', # fallback check query
                    })
                    break

    # --- Rule 4: CREATE MATERIALIZED VIEW ---
    for cluster in clusters:
        sql = cluster["representative_sql"]
        upper_sql = sql.lower()
        if "group by" in upper_sql or any(agg in upper_sql for agg in ["count(", "sum(", "avg(", "min(", "max("]):
            mv_name = f"mv_summary_{abs(hash(sql)) & 0xffffffff}"
            if not any(r["optimization_type"] == "CREATE_MATERIALIZED_VIEW" and mv_name in r["ddl"] for r in recommendations):
                recommendations.append({
                    "optimization_type": "CREATE_MATERIALIZED_VIEW",
                    "ddl": f'CREATE MATERIALIZED VIEW "{mv_name}" AS {sql}',
                    "rollback_ddl": f'DROP MATERIALIZED VIEW IF EXISTS "{mv_name}"',
                    "expected_improvement_ms": 150.0,
                    "write_amplification": 2.0,
                    "risk_score": 0.4,
                    "confidence_score": 0.7,
                    "explanation": f"Cluster '{cluster['label']}' contains complex aggregation logic. Creating a materialized view '{mv_name}' will precompute results. (Refresh Strategy: REFRESH MATERIALIZED VIEW CONCURRENTLY \"{mv_name}\" daily)",
                    "representative_sql": sql,
                })

    # --- Rule 5: REINDEX ---
    for idx in existing_indexes:
        idx_name = idx["name"]
        table = idx["table"]
        scans = usage_map.get(idx_name, 0)
        if scans > 5000:
            if not IDENTIFIER_REGEX.match(idx_name) or not IDENTIFIER_REGEX.match(table):
                continue
            recommendations.append({
                "optimization_type": "REINDEX",
                "ddl": f'REINDEX INDEX CONCURRENTLY "{idx_name}"',
                "rollback_ddl": "",  # REINDEX is a rebuild operation, no rollback possible/needed
                "expected_improvement_ms": 10.0,
                "write_amplification": 0.2,
                "risk_score": 0.2,
                "confidence_score": 0.8,
                "explanation": f"Index '{idx_name}' on table '{table}' is highly active ({scans} scans). Reindexing will rebuild the B-Tree structure and reclaim bloated disk space.",
                "representative_sql": f'SELECT * FROM "{table}" LIMIT 10',
            })

    return recommendations
