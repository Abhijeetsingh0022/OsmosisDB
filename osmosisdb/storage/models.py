"""Pydantic models for OsmosisDB storage layer."""

from __future__ import annotations

from pydantic import BaseModel


class QueryRecord(BaseModel):
    """A single logged query."""

    id: int | None = None
    sql: str
    fingerprint: str
    tables: list[str]
    filter_columns: list[str]
    join_columns: list[str]
    order_columns: list[str]
    latency_ms: float
    timestamp: float
    client_addr: str


class OptimizationRecord(BaseModel):
    """An optimization plan or executed change."""

    id: int | None = None
    optimization_type: str
    ddl: str
    rollback_ddl: str
    status: str
    expected_improvement_ms: float = 0.0
    write_amplification: float = 0.0
    risk_score: float = 0.0
    confidence_score: float = 0.0
    explain_before: str = ""
    explain_after: str = ""
    benchmark_p50: float | None = None
    benchmark_p95: float | None = None
    benchmark_p99: float | None = None
    explanation: str = ""
    created_at: float = 0.0
    executed_at: float | None = None


class PatternCluster(BaseModel):
    """A discovered query pattern cluster."""

    id: int | None = None
    label: str
    member_count: int
    representative_sql: str
    created_at: float


class DriftSnapshot(BaseModel):
    """A point-in-time drift measurement."""

    id: int | None = None
    drift_score: float
    emerging_patterns: int
    disappearing_patterns: int
    timestamp: float
