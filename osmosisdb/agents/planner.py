"""Optimization Planner Agent."""

from __future__ import annotations

import logging
import time
from osmosisdb.config import Settings
from osmosisdb.storage.sqlite import QueryStore
from osmosisdb.optimizer.catalog import PostgresCatalog
from osmosisdb.optimizer.recommender import generate_recommendations

logger = logging.getLogger(__name__)


class OptimizationPlannerAgent:
    """Agent that introspects PostgreSQL catalog and generates optimization plans."""

    def __init__(self, settings: Settings, store: QueryStore) -> None:
        self.settings = settings
        self.store = store

    def run_cycle(self) -> list[dict]:
        """Query pattern clusters and PG catalog, then save pending recommendations."""
        logger.info("Starting optimization planning cycle...")
        
        # Verify target DSN is reachable first to avoid duplicate/corrupt recommendations
        import psycopg
        db_online = True
        try:
            with psycopg.connect(self.settings.postgres.dsn, connect_timeout=1):
                pass
        except Exception as e:
            logger.warning("Target database connection offline during planning cycle: %s. Falling back to local catalog registry.", e)
            db_online = False

        clusters = self.store.get_recent_clusters()
        if not clusters:
            logger.info("No query clusters found. Skipping planning cycle.")
            return []

        if db_online:
            catalog = PostgresCatalog(self.settings.postgres.dsn)
            existing_indexes = catalog.get_existing_indexes()
            index_usage = catalog.get_index_usage_stats()
            table_stats = catalog.get_table_stats()
        else:
            # Fall back to local SQLite registry completed indexes to avoid duplicate index recommendations
            completed_opts = self.store.get_optimization_log()
            existing_indexes = []
            for opt in completed_opts:
                if opt["status"] == "completed" and "create index" in opt["ddl"].lower():
                    try:
                        import re
                        match = re.search(
                            r"INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w_]+)\s+ON\s+([\w_\.]+)",
                            opt["ddl"],
                            re.IGNORECASE,
                        )
                        if match:
                            idx_name = match.group(1)
                            table_name = match.group(2).split(".")[-1]
                            existing_indexes.append({
                                "table": table_name,
                                "name": idx_name,
                                "definition": opt["ddl"],
                            })
                    except Exception:
                        pass
            
            index_usage = [{"name": item["name"], "scans": 0} for item in existing_indexes]
            
            # Find unique tables referenced in query clusters
            unique_tables = set()
            from osmosisdb.analysis.parser import extract_metadata
            for c in clusters:
                try:
                    meta = extract_metadata(c["representative_sql"])
                    for t in meta.tables:
                        unique_tables.add(t)
                except Exception:
                    pass
            table_stats = [{"table": t, "seq_scans": 0, "seq_tup_read": 0} for t in unique_tables]

        logger.info("Analyzing %d clusters and catalog metadata...", len(clusters))
        recs = generate_recommendations(clusters, existing_indexes, index_usage, table_stats)

        # Helper to normalize DDL for case-insensitive, whitespace-collapsed comparison
        def normalize_ddl(ddl: str) -> str:
            return " ".join(ddl.lower().split())

        # De-duplicate against existing pending optimizations to avoid cluttering log
        pending = {normalize_ddl(item["ddl"]) for item in self.store.get_pending_recommendations()}
        history = {normalize_ddl(item["ddl"]) for item in self.store.get_optimization_log() if item["status"] == "completed"}

        filtered_recs = []
        created_at = time.time()
        for r in recs:
            if normalize_ddl(r["ddl"]) in pending or normalize_ddl(r["ddl"]) in history:
                continue
            
            # Enrich explanation using LLM (if configured)
            if self.settings.groq.api_key:
                try:
                    from osmosisdb.reports.generator import generate_optimization_report
                    llm_explanation = generate_optimization_report(
                        opt_type=r["optimization_type"],
                        ddl=r["ddl"],
                        explanation_context=r["explanation"],
                        groq_api_key=self.settings.groq.api_key,
                        model_name=self.settings.groq.model
                    )
                    r["explanation"] = llm_explanation
                except Exception as e:
                    logger.warning("Failed to generate LLM explanation for DDL %s: %s", r["ddl"], e)

            r["created_at"] = created_at
            filtered_recs.append(r)

        if filtered_recs:
            self.store.insert_recommendations(filtered_recs)
            logger.info("Stored %d new pending optimization recommendations.", len(filtered_recs))
        else:
            logger.info("No new optimization recommendations discovered.")

        return filtered_recs
