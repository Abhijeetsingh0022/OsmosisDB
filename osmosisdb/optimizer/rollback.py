"""Manual rollback interface."""

from __future__ import annotations

import logging
from osmosisdb.storage.sqlite import QueryStore
from osmosisdb.optimizer.executor import OptimizationExecutor

logger = logging.getLogger(__name__)


def rollback_optimization(
    opt_id: int,
    store: QueryStore,
    dsn: str,
) -> bool:
    """Execute the rollback DDL for a completed optimization and update its database status."""
    record = store.get_optimization_by_id(opt_id)
    if not record:
        logger.error("Optimization record not found: %d", opt_id)
        return False

    if record["status"] != "completed":
        logger.error(
            "Cannot rollback optimization %d with status '%s' (only 'completed' allowed)",
            opt_id,
            record["status"],
        )
        return False

    rollback_ddl = record["rollback_ddl"]
    if not rollback_ddl:
        logger.warning("No rollback DDL found for optimization: %d", opt_id)
        store.update_optimization_status(opt_id, "rolled_back")
        return True

    logger.info("Executing manual rollback for optimization %d: %s", opt_id, rollback_ddl)
    executor = OptimizationExecutor(dsn)
    success = executor.run_ddl(rollback_ddl)

    if success:
        store.update_optimization_status(opt_id, "rolled_back")
        logger.info("Optimization %d successfully rolled back.", opt_id)
        return True
    else:
        logger.error("Failed to execute rollback DDL for optimization %d", opt_id)
        return False
