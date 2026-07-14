"""GET and POST endpoints for configuration settings."""

from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["config"])


class ConfigUpdate(BaseModel):
    drift_threshold: float
    pattern_interval_seconds: int
    approval_mode: str
    maintenance_window: str


@router.get("/config")
def get_config(request: Request) -> dict:
    """Get active middleware settings."""
    settings = request.app.state.settings
    return {
        "drift_threshold": settings.intelligence.drift_threshold,
        "pattern_interval_seconds": settings.intelligence.pattern_interval_seconds,
        "approval_mode": settings.approval.mode,
        "maintenance_window": settings.maintenance.windows[0] if settings.maintenance.windows else "0 2 * * *",
    }


@router.post("/config")
def update_config(request: Request, body: ConfigUpdate) -> dict:
    """Update settings in memory and write to config.toml."""
    settings = request.app.state.settings

    # Validate approval mode
    if body.approval_mode not in ["auto", "manual"]:
        raise HTTPException(status_code=400, detail="Invalid approval mode. Must be 'auto' or 'manual'.")

    # Update settings
    settings.intelligence.drift_threshold = body.drift_threshold
    settings.intelligence.pattern_interval_seconds = body.pattern_interval_seconds
    settings.approval.mode = body.approval_mode
    settings.maintenance.windows = [body.maintenance_window]

    # Serialize and write back to config file
    config_path = getattr(request.app.state, "config_path", None) or "config.toml"
    try:
        windows_toml = "[" + ", ".join(f'"{w}"' for w in settings.maintenance.windows) + "]"
        lines = [
            "[proxy]",
            f'listen_host = "{settings.proxy.listen_host}"',
            f"listen_port = {settings.proxy.listen_port}",
            "",
            "# [postgres] DSN is sourced from environment variables — not written here for security.",
            "",
            "[embedding]",
            f'model = "{settings.embedding.model}"',
            "",
            "[intelligence]",
            f"drift_threshold = {settings.intelligence.drift_threshold}",
            f"pattern_interval_seconds = {settings.intelligence.pattern_interval_seconds}",
            f"min_queries_for_clustering = {settings.intelligence.min_queries_for_clustering}",
            "",
            "[maintenance]",
            f"windows = {windows_toml}",
            "",
            "[approval]",
            f'mode = "{settings.approval.mode}"',
            "",
            "[dashboard]",
            f'host = "{settings.dashboard.host}"',
            f"port = {settings.dashboard.port}",
            "",
            "[groq]",
            f'model = "{settings.groq.model}"',
        ]
        with open(config_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        # If writing fails (e.g. read-only filesystem), we still keep the in-memory update
        pass

    return {"status": "success", "message": "Configuration updated successfully"}
