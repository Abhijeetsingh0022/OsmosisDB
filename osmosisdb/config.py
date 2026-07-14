"""OsmosisDB configuration — TOML file + environment variable overrides."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProxyConfig(BaseModel):
    listen_host: str = "127.0.0.1"
    listen_port: int = 6432


class PostgresConfig(BaseModel):
    dsn: str = "postgres://localhost:5432/postgres"


class EmbeddingConfig(BaseModel):
    model: str = "all-MiniLM-L6-v2"


class IntelligenceConfig(BaseModel):
    drift_threshold: float = 0.3
    pattern_interval_seconds: int = 300
    min_queries_for_clustering: int = 50


class MaintenanceConfig(BaseModel):
    windows: list[str] = Field(default_factory=lambda: ["0 2 * * *"])


class ApprovalConfig(BaseModel):
    mode: Literal["auto", "manual"] = "auto"


class DashboardConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8080


class GroqConfig(BaseModel):
    api_key: str = ""
    model: str = "llama-3.3-70b-versatile"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="OSMOSIS_",
        env_nested_delimiter="__",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    proxy: ProxyConfig = Field(default_factory=ProxyConfig)
    postgres: PostgresConfig = Field(default_factory=PostgresConfig)
    embedding: EmbeddingConfig = Field(default_factory=EmbeddingConfig)
    intelligence: IntelligenceConfig = Field(default_factory=IntelligenceConfig)
    maintenance: MaintenanceConfig = Field(default_factory=MaintenanceConfig)
    approval: ApprovalConfig = Field(default_factory=ApprovalConfig)
    dashboard: DashboardConfig = Field(default_factory=DashboardConfig)
    groq: GroqConfig = Field(default_factory=GroqConfig)


_CONFIG_SEARCH = [Path("config.toml"), Path("osmosisdb.toml"), Path.home() / ".config" / "osmosisdb" / "config.toml"]


def load_settings(config_path: Path | None = None) -> Settings:
    """Load settings from TOML file (if found) merged with env overrides."""
    raw: dict = {}
    paths = [config_path] if config_path else _CONFIG_SEARCH
    for p in paths:
        if p and p.is_file():
            with open(p, "rb") as f:
                raw = tomllib.load(f)
            break

    # Env vars (OSMOSIS_POSTGRES__DSN, etc.) override TOML via pydantic-settings
    return Settings(**raw)
