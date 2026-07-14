"""GET endpoints for catalog index health and pending recommendations."""

from __future__ import annotations

import logging
from fastapi import APIRouter, Request
from osmosisdb.optimizer.catalog import PostgresCatalog

logger = logging.getLogger(__name__)

router = APIRouter(tags=["indexes"])


@router.get("/indexes/health")
def get_index_health(request: Request) -> list[dict]:
    """Return health/scans information for all user indexes."""
    settings = request.app.state.settings
    catalog = PostgresCatalog(settings.postgres.dsn)
    
    import psycopg
    try:
        with psycopg.connect(settings.postgres.dsn, connect_timeout=1):
            return catalog.get_index_usage_stats()
    except Exception as e:
        # Fall back to local SQLite applied indexes log
        logger.warning("PG catalog connection failed. Falling back to local index registry: %s", e)
            
        store = request.app.state.store
        completed_opts = store.get_optimization_log()
        fallback_indexes = []
        for opt in completed_opts:
            if opt["status"] == "completed" and "create index" in opt["ddl"].lower():
                try:
                    parts = opt["ddl"].split()
                    idx_name = ""
                    table_name = ""
                    for idx, part in enumerate(parts):
                        if part.lower() == "index" and idx + 1 < len(parts):
                            next_part = parts[idx + 1]
                            if next_part.lower() == "concurrently" and idx + 2 < len(parts):
                                idx_name = parts[idx + 2]
                            else:
                                idx_name = next_part
                        if part.lower() == "on" and idx + 1 < len(parts):
                            table_name = parts[idx + 1]
                    if idx_name and table_name:
                        fallback_indexes.append({
                            "table": table_name.strip("(),"),
                            "name": idx_name.strip("(),"),
                            "scans": 0,
                        })
                except Exception:
                    pass
        return fallback_indexes


@router.get("/indexes/recommendations")
def get_pending_recommendations(request: Request) -> list[dict]:
    """Return all pending recommendations."""
    store = request.app.state.store
    return store.get_pending_recommendations()
