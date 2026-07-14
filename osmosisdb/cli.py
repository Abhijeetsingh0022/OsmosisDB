"""OsmosisDB CLI — entry point for all commands."""

from __future__ import annotations

import asyncio
from pathlib import Path

import click

from osmosisdb.config import load_settings


@click.group()
@click.option("--config", "config_path", type=click.Path(exists=True, path_type=Path), default=None, help="Path to config.toml")
@click.pass_context
def cli(ctx: click.Context, config_path: Path | None) -> None:
    """OsmosisDB — Intelligent PostgreSQL middleware."""
    ctx.ensure_object(dict)
    ctx.obj["settings"] = load_settings(config_path)
    ctx.obj["config_path"] = config_path


@cli.command()
@click.pass_context
def start(ctx: click.Context) -> None:
    """Start the OsmosisDB proxy, API server, and background agents."""
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    settings = ctx.obj["settings"]
    click.echo("OsmosisDB starting...")
    click.echo(f"  Proxy: {settings.proxy.listen_host}:{settings.proxy.listen_port}")
    click.echo(f"  API:   http://{settings.dashboard.host}:{settings.dashboard.port}")
    click.echo(f"  PG:    {_mask_dsn(settings.postgres.dsn)}")
    click.echo(f"  Mode:  {settings.approval.mode}-approve")

    from osmosisdb.api.app import create_app
    from osmosisdb.proxy.server import run_proxy

    app = create_app(settings)
    app.state.config_path = ctx.obj.get("config_path")

    async def _run() -> None:
        import uvicorn

        api_config = uvicorn.Config(
            app,
            host=settings.dashboard.host,
            port=settings.dashboard.port,
            log_level="info",
        )
        api_server = uvicorn.Server(api_config)

        await asyncio.gather(
            run_proxy(settings),
            api_server.serve(),
        )

    asyncio.run(_run())


@cli.command()
@click.pass_context
def config(ctx: click.Context) -> None:
    """Show the resolved configuration."""
    import json

    settings = ctx.obj["settings"]
    data = settings.model_dump()
    data["postgres"]["dsn"] = _mask_dsn(data["postgres"]["dsn"])
    click.echo(json.dumps(data, indent=2))


@cli.command()
def status() -> None:
    """Check if OsmosisDB is running."""
    click.echo("Status: not implemented yet (Phase 4)")


def _mask_dsn(dsn: str) -> str:
    """Mask password in DSN for display."""
    try:
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(dsn)
        if parsed.password:
            masked = parsed._replace(netloc=f"{parsed.username}:***@{parsed.hostname}:{parsed.port or 5432}")
            return urlunparse(masked)
    except Exception:
        pass
    return dsn
