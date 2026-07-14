"""GET and POST endpoints for DDL optimizations and rollbacks."""

from __future__ import annotations

import logging
import threading
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from osmosisdb.optimizer.rollback import rollback_optimization

logger = logging.getLogger(__name__)

router = APIRouter(tags=["optimisations"])


class ApproveRequest(BaseModel):
    optimization_id: int


@router.get("/optimisations/log")
def get_optimization_log(request: Request) -> list[dict]:
    """Return full DDL optimization history."""
    store = request.app.state.store
    return store.get_optimization_log()


@router.post("/optimisations/approve")
def approve_optimization(request: Request, body: ApproveRequest) -> dict:
    """Approve a recommendation and trigger execution."""
    store = request.app.state.store
    opt_id = body.optimization_id

    record = store.get_optimization_by_id(opt_id)
    if not record:
        raise HTTPException(status_code=404, detail="Optimization record not found")

    if record["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve optimization in state '{record['status']}'",
        )

    # Update status to approved
    store.update_optimization_status(opt_id, "approved")

    # Trigger Execution Agent run in a background thread for instant feedback
    try:
        from osmosisdb.agents.executor import ExecutionAgent
        settings = request.app.state.settings
        executor_agent = ExecutionAgent(settings, store)
        thread = threading.Thread(target=executor_agent.run_cycle, daemon=True)
        thread.start()
    except Exception:
        logger.exception("Failed to run execution agent in background")

    return {"status": "approved", "message": f"Optimization {opt_id} approved for execution"}


@router.post("/optimisations/rollback/{opt_id}")
def rollback_opt(request: Request, opt_id: int) -> dict:
    """Trigger a rollback for a completed DDL optimization."""
    store = request.app.state.store
    settings = request.app.state.settings

    success = rollback_optimization(opt_id, store, settings.postgres.dsn)
    if not success:
        raise HTTPException(status_code=400, detail="Rollback execution failed")

    return {"status": "rolled_back", "message": f"Optimization {opt_id} rolled back successfully"}
