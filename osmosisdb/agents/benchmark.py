"""Benchmark Agent — replays query workloads to measure p50/p95/p99 latency performance."""

from __future__ import annotations

import logging
import time
import numpy as np
import psycopg

from osmosisdb.config import Settings
from osmosisdb.storage.sqlite import QueryStore

logger = logging.getLogger(__name__)


class BenchmarkAgent:
    """Agent that runs query workloads against PostgreSQL to compile latency statistics."""

    def __init__(self, settings: Settings, store: QueryStore) -> None:
        self.settings = settings
        self.store = store

    def run_benchmark(self, opt_id: int, query: str | None, runs: int = 20) -> tuple[float, float, float] | None:
        """Run the query against PostgreSQL repeatedly to measure p50/p95/p99 latency."""
        if not query:
            return None

        # Clean placeholders to avoid UndefinedParameter errors on direct benchmark runs
        import re
        clean_query = re.sub(r'\$\d+', "'1'", query)
        clean_query = clean_query.replace('?', "'1'")

        logger.info("Starting benchmark for query (ID %d): %s", opt_id, clean_query[:100])
        latencies = []

        try:
            with psycopg.connect(self.settings.postgres.dsn) as conn:
                # Use a transaction block that is rolled back to protect database state
                conn.autocommit = False
                with conn.cursor() as cur:
                    for _ in range(runs):
                        start_time = time.perf_counter()
                        cur.execute(clean_query)
                        if cur.description is not None:
                            cur.fetchall()
                        elapsed = (time.perf_counter() - start_time) * 1000.0  # ms
                        latencies.append(elapsed)
                    conn.rollback()

            if latencies:
                p50 = float(np.percentile(latencies, 50))
                p95 = float(np.percentile(latencies, 95))
                p99 = float(np.percentile(latencies, 99))
                logger.info(
                    "Benchmark completed: p50=%.2fms, p95=%.2fms, p99=%.2fms",
                    p50,
                    p95,
                    p99,
                )
                self.store.update_optimization_benchmarks(opt_id, p50, p95, p99)
                return p50, p95, p99

        except Exception as e:
            logger.error("Failed to run benchmark for query: %s", e)

        return None
