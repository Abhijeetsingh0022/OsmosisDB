# OsmosisDB --- Requirements Specification (requirements.md)

**Project Name:** OsmosisDB\
**Version:** 1.0\
**Status:** Requirements Specification\
**Target Database:** PostgreSQL 15+\
**Development Timeline:** 4 Weeks (MVP)

------------------------------------------------------------------------

# 1. Project Objective

OsmosisDB is an intelligent middleware layer for PostgreSQL that
continuously analyzes database query behavior, learns access patterns,
detects workload changes, and safely optimizes database structures
automatically or with administrator approval.

The system must operate with minimal runtime overhead while providing
continuous performance improvements through intelligent indexing,
clustering, and materialized view management.

------------------------------------------------------------------------

# 2. Core Requirements

## Functional Requirements

### FR-1 Query Interception

The system shall:

-   Act as a transparent PostgreSQL proxy (implemented using a high-performance native proxy daemon or passive packet capture to meet latency SLAs).
-   Listen on a configurable proxy port.
-   Forward every request to PostgreSQL.
-   Return responses without modifying application behavior.
-   Record metadata asynchronously via a high-speed, non-blocking queue.
-   Maintain less than 1 ms average additional latency.

### FR-2 Query Analysis

The system shall extract and store:

-   SQL fingerprint
-   Raw SQL
-   Tables accessed
-   Filtered columns
-   JOIN columns
-   ORDER BY columns
-   Query latency
-   Timestamp
-   Caller information

The parser must process queries asynchronously from the hot path using a background worker and support common PostgreSQL SQL syntax using `sqlglot`.

### FR-3 Query Logging

The system shall maintain a local metadata database using SQLite configured with Write-Ahead Logging (WAL) and buffered, non-blocking writes to prevent database lockups.

Stored information shall include:

-   Query metadata
-   Execution statistics
-   Latency
-   Fingerprints
-   Optimization history

No application data shall be stored.

### FR-4 Pattern Learning

Every configurable interval (default 5 minutes), the system shall:

-   Read recent query logs
-   Generate semantic embeddings
-   Cluster similar queries
-   Identify dominant access patterns
-   Store pattern centroids
-   Label discovered clusters

### FR-5 Drift Detection

The system shall compare recent query clusters with historical clusters.

It shall:

-   Calculate semantic similarity
-   Produce a drift score
-   Detect emerging workloads
-   Detect disappearing workloads
-   Trigger optimization planning when the drift threshold is exceeded

### FR-6 Optimization Planning

The planner shall:

-   Inspect PostgreSQL catalog metadata
-   Read current indexes
-   Read index usage statistics
-   Analyze access patterns
-   Generate optimization recommendations

Supported recommendations include:

-   CREATE INDEX CONCURRENTLY
-   DROP INDEX (requires monitoring index usage for at least 30 days and warning about invalidating potential background tasks)
-   CLUSTER (requires strict admin warning/approval as it acquires an AccessExclusiveLock that blocks reads/writes on large tables)
-   CREATE MATERIALIZED VIEW (must include a refresh strategy and clarify query routing)
-   REINDEX

Recommendations shall include:

-   Expected latency improvement
-   Estimated write amplification
-   Risk score
-   Confidence score

### FR-7 Execution Engine

The execution engine shall:

-   Execute approved optimization plans
-   Run only during configured maintenance windows
-   Execute operations concurrently where supported
-   Collect query plans using EXPLAIN (or EXPLAIN ANALYZE wrapped in a transaction that is strictly rolled back for write queries) before execution
-   Collect query plans using EXPLAIN (or EXPLAIN ANALYZE wrapped in a transaction that is strictly rolled back for write queries) after execution
-   Automatically rollback regressions

### FR-8 Benchmarking

After optimization, the system shall:

-   Replay representative read-only workloads or perform benchmarks in a sandboxed staging environment
-   Measure p50 latency
-   Measure p95 latency
-   Measure p99 latency
-   Store benchmark results
-   Update optimization history

### FR-9 Dashboard

The dashboard shall provide real-time visualization of:

-   Query heatmaps
-   Query clusters
-   Drift history
-   Index health
-   Optimization history
-   Pending recommendations
-   Cost estimation
-   Live execution status

Updates shall be delivered using Server-Sent Events (SSE).

### FR-10 REST API

The backend shall expose REST endpoints for:

-   Recent queries
-   Pattern clusters
-   Drift history
-   Optimization logs
-   Index health
-   Recommendations
-   Plan approval
-   Rollback operations
-   Live event stream

------------------------------------------------------------------------

# 3. Non-Functional Requirements

## Performance

-   Proxy overhead shall remain below 1 ms average.
-   Query interception shall be asynchronous.
-   Background intelligence shall never block application queries.
-   Optimization tasks shall execute outside peak traffic windows.

## Reliability

The system shall recover gracefully after crashes, resume scheduled
jobs, preserve optimization history, maintain audit logs, and prevent
partial execution failures.

## Scalability

The architecture shall support multiple PostgreSQL databases, multiple
schemas, large query histories, millions of logged queries, and
incremental clustering.

## Security

The system shall never modify application queries, require configurable
approval for structural changes, store credentials securely, restrict
dashboard access, and log every executed DDL statement.

## Maintainability

The project shall remain modular with clear separation of proxy,
intelligence, agents, API, dashboard, database layer, and configuration.

------------------------------------------------------------------------

# 4. System Architecture

1.  Query Interceptor
2.  Pattern Engine
3.  Planner
4.  Execution Engine
5.  Dashboard

------------------------------------------------------------------------

# 5. Agent Requirements

-   Query Observer Agent
-   Pattern Learner Agent
-   Drift Detector Agent
-   Optimization Planner Agent (uses deterministic, rule-based heuristics for migration planning; LLM capability is strictly used for explanations)
-   Execution Agent
-   Benchmark Agent

Each agent shall operate independently according to the defined
execution schedule.

------------------------------------------------------------------------

# 6. Database Requirements

The system shall maintain:

-   Query Log
-   Optimization Log

------------------------------------------------------------------------

# 7. Technology Stack

## Backend

-   Python
-   FastAPI
-   psycopg (v3, sync/async support)
-   APScheduler
-   sqlglot
-   Click
-   Pydantic

## AI

-   sentence-transformers
-   HDBSCAN
-   sqlite-vec or pgvector (embedded vector search)
-   LangGraph (strictly for report generation / explanations)
-   LangChain (strictly for report generation / explanations)
-   Groq API

## Frontend

-   React
-   Vite
-   Recharts
-   D3.js
-   Server-Sent Events

## Database

-   PostgreSQL 15+
-   SQLite

------------------------------------------------------------------------

# 8. Configuration

The application shall support configurable proxy settings, PostgreSQL
connection, embedding model, drift threshold, maintenance windows,
approval mode, dashboard settings, and scheduling parameters.

------------------------------------------------------------------------

# 9. API Requirements

  Method   Endpoint                           Purpose
  -------- ---------------------------------- ---------------------------
  GET      /api/queries/recent                Recent query history
  GET      /api/patterns/clusters             Current workload clusters
  GET      /api/drift/timeline                Drift history
  GET      /api/optimisations/log             Optimization history
  GET      /api/indexes/health                Index statistics
  GET      /api/indexes/recommendations       Pending recommendations
  POST     /api/optimisations/approve         Approve optimization
  POST     /api/optimisations/rollback/{id}   Rollback optimization
  GET      /api/stream/live                   Live dashboard stream

------------------------------------------------------------------------

# 10. Dashboard Requirements

-   Query Heatmap
-   Pattern Cluster Visualization
-   Drift Timeline
-   Index Health
-   Optimization Log
-   Cost Estimator
-   Pending Recommendations
-   Live Execution Status

------------------------------------------------------------------------

# 11. Development Roadmap

## Week 1

Proxy, parser, logging, CLI, FastAPI.

## Week 2

Embeddings, clustering, drift detection, scheduler.

## Week 3

Planner, execution engine, rollback.

## Week 4

Dashboard, SSE, documentation, packaging.

------------------------------------------------------------------------

# 12. Success Criteria

-   Transparent proxy
-   Continuous logging
-   Semantic clustering
-   Drift detection
-   AI recommendations
-   Safe optimization execution
-   Benchmarking
-   Live dashboard
-   REST API
-   Documentation

------------------------------------------------------------------------

# 13. Future Enhancements

-   Multi-database support
-   MySQL support
-   SQL Server support
-   Kubernetes Operator
-   RBAC
-   Notifications
-   Predictive optimization
-   Multi-tenant deployment
