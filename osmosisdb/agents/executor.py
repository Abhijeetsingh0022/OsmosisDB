"""Execution Agent — processes approved or auto-approved optimization recommendations."""

from __future__ import annotations

import logging
import time
from osmosisdb.config import Settings
from osmosisdb.storage.sqlite import QueryStore
from osmosisdb.optimizer.executor import OptimizationExecutor
from osmosisdb.agents.benchmark import BenchmarkAgent

import datetime

logger = logging.getLogger(__name__)


def matches_cron(dt: datetime.datetime, cron_expr: str) -> bool:
    fields = cron_expr.strip().split()
    if len(fields) != 5:
        return False
    
    minute, hour, dom, month, dow = fields
    dt_dow = (dt.weekday() + 1) % 7
        
    def matches_field(val: int, field: str, is_dow: bool = False) -> bool:
        if field == "*":
            return True
        if "," in field:
            return any(matches_field(val, f, is_dow) for f in field.split(","))
        if "-" in field:
            start, end = map(int, field.split("-"))
            return start <= val <= end
        if "/" in field:
            parts = field.split("/")
            step = int(parts[1])
            if parts[0] == "*":
                return val % step == 0
            else:
                start = int(parts[0])
                return val >= start and (val - start) % step == 0
        
        val_int = int(field)
        if is_dow and val_int == 7:
            val_int = 0
        return val == val_int

    return (
        matches_field(dt.minute, minute) and
        matches_field(dt.hour, hour) and
        matches_field(dt.day, dom) and
        matches_field(dt.month, month) and
        matches_field(dt_dow, dow, is_dow=True)
    )


def is_in_maintenance_window(cron_expr: str) -> bool:
    now = datetime.datetime.now()
    # Check if the cron triggered at any minute in the last 60 minutes
    for offset in range(60):
        check_time = now - datetime.timedelta(minutes=offset)
        if matches_cron(check_time, cron_expr):
            return True
    return False


class ExecutionAgent:
    """Agent that runs during maintenance windows to execute and verify DDL changes."""

    def __init__(self, settings: Settings, store: QueryStore) -> None:
        self.settings = settings
        self.store = store

    def run_cycle(self) -> int:
        """Find approved or auto-approved recommendations and execute them.

        Returns:
            The number of successfully executed optimizations.
        """
        logger.info("Starting DDL execution cycle...")
        # Get pending recommendations (if auto-approve enabled) or manually approved ones
        all_recs = self.store.get_optimization_log()

        # Check if currently inside a maintenance window
        is_maintenance = False
        for window in self.settings.maintenance.windows:
            if is_in_maintenance_window(window):
                is_maintenance = True
                break

        to_execute = []
        for r in all_recs:
            if r["status"] == "approved":
                # Manually approved optimizations execute immediately
                to_execute.append(r)
            elif r["status"] == "pending" and self.settings.approval.mode == "auto":
                # Auto-approved optimizations execute only during active maintenance windows
                if is_maintenance:
                    to_execute.append(r)

        if not to_execute:
            logger.info("No approved or auto-approved DDL changes to execute.")
            return 0

        logger.info("Found %d optimizations to execute.", len(to_execute))
        executor = OptimizationExecutor(self.settings.postgres.dsn)
        benchmark_agent = BenchmarkAgent(self.settings, self.store)
        executed_count = 0

        for r in to_execute:
            opt_id = r["id"]
            ddl = r["ddl"]
            rollback_ddl = r["rollback_ddl"]
            rep_query = r["representative_sql"]

            logger.info("Processing optimization %d: %s", opt_id, ddl)
            self.store.update_optimization_status(opt_id, "executing", executed_at=time.time())

            status, before, after, err = executor.execute_and_verify(
                ddl=ddl,
                rollback_ddl=rollback_ddl,
                representative_query=rep_query,
            )

            self.store.update_optimization_status(
                opt_id,
                status=status,
                explain_before=before,
                explain_after=after,
                executed_at=time.time(),
            )

            if status == "completed":
                logger.info("Optimization %d succeeded. Running benchmarks...", opt_id)
                executed_count += 1
                # Run benchmarking
                benchmark_agent.run_benchmark(opt_id, rep_query)
            elif status == "rolled_back":
                logger.warning("Optimization %d rolled back due to plan regression: %s", opt_id, err)
            else:
                logger.error("Optimization %d failed: %s", opt_id, err)

        return executed_count
