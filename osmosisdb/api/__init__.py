"""FastAPI application factory for OsmosisDB."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from osmosisdb.config import Settings
from osmosisdb.storage.sqlite import QueryStore


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup: open SQLite. Shutdown: flush and close."""
    store = QueryStore()
    app.state.store = store
    yield
    store.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="OsmosisDB",
        description="Intelligent PostgreSQL middleware — REST API",
        version="0.1.0",
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if settings:
        app.state.settings = settings

    from osmosisdb.api.routes import queries

    app.include_router(queries.router, prefix="/api")

    return app
