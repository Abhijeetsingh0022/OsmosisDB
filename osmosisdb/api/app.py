"""FastAPI application factory for OsmosisDB."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from osmosisdb.config import Settings
from osmosisdb.storage.sqlite import QueryStore


import asyncio
import logging

async def start_background_agents(settings: Settings, store: QueryStore) -> None:
    """Launch background task loop to periodically run learner, detector, and planner cycles."""
    logger = logging.getLogger("osmosisdb.agents")
    logger.info("Initializing background agent scheduler...")
    
    from osmosisdb.agents.learner import PatternLearnerAgent
    from osmosisdb.agents.detector import DriftDetectorAgent
    from osmosisdb.agents.planner import OptimizationPlannerAgent
    
    learner = PatternLearnerAgent(settings, store)
    detector = DriftDetectorAgent(settings, store)
    planner = OptimizationPlannerAgent(settings, store)
    
    # Initial sleep to allow query records buffer to accumulate
    await asyncio.sleep(5)
    
    while True:
        try:
            logger.info("Starting scheduled background agent planning cycle...")
            # 1. Compare against previous snapshots for drift — fetch old clusters BEFORE running learner
            old_clusters = []
            try:
                old_clusters = store.get_recent_clusters()
            except Exception:
                pass

            # 2. Run pattern learning
            new_clusters = learner.run_cycle()
            
            if new_clusters:
                detector.run_cycle(new_clusters, old_clusters)
            else:
                # Fall back to planner direct scan check
                planner.run_cycle()

            # 3. Run execution agent to process pending/approved DDL optimizations
            try:
                from osmosisdb.agents.executor import ExecutionAgent
                executor = ExecutionAgent(settings, store)
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, executor.run_cycle)
            except Exception as e:
                logger.warning("Failed to run execution agent in background cycle: %s", e)
                
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("Error in background agent scheduler loop: %s", e)
            
        interval = settings.intelligence.pattern_interval_seconds
        await asyncio.sleep(interval)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    store = QueryStore()
    app.state.store = store
    
    settings = app.state.settings if hasattr(app.state, "settings") else None
    task = None
    if settings:
        task = asyncio.create_task(start_background_agents(settings, store))
        
    yield
    
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
            
    store.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="OsmosisDB",
        description="Intelligent PostgreSQL middleware — REST API",
        version="0.1.0",
        lifespan=_lifespan,
    )

    allowed_origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",  # React development server
        "http://127.0.0.1:5173",
    ]
    if settings:
        app.state.settings = settings
        host = settings.dashboard.host
        port = settings.dashboard.port
        if host not in ("0.0.0.0", "127.0.0.1", "localhost"):
            allowed_origins.append(f"http://{host}:{port}")
        if port != 8080:
            allowed_origins.append(f"http://localhost:{port}")
            allowed_origins.append(f"http://127.0.0.1:{port}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from osmosisdb.api.routes import queries, patterns, drift, optimisations, indexes, stream, config, copilot

    app.include_router(queries.router, prefix="/api")
    app.include_router(patterns.router, prefix="/api")
    app.include_router(drift.router, prefix="/api")
    app.include_router(optimisations.router, prefix="/api")
    app.include_router(indexes.router, prefix="/api")
    app.include_router(stream.router, prefix="/api")
    app.include_router(config.router, prefix="/api")
    app.include_router(copilot.router, prefix="/api")

    # Serve React dashboard static files if compiled
    import os
    from fastapi.staticfiles import StaticFiles
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(os.path.dirname(os.path.dirname(current_dir)), "dashboard", "dist")
    if os.path.exists(dist_dir):
        app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")

    return app
