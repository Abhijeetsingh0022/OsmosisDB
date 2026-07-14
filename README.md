<p align="center">
  <img src="logo.png" width="160" alt="OsmosisDB Logo" />
</p>

<h1 align="center">OsmosisDB</h1>

<p align="center">
  <strong>The world's first autonomous, zero-regression self‑tuning PostgreSQL middleware</strong>
</p>

<p align="center">
  Works with standard Postgres clients, Neon DB, Supabase, AWS RDS, GCP Cloud SQL, and more
</p>

<p align="center">
  <a href="https://github.com/Abhijeetsingh0022/OsmosisDB"><img src="https://img.shields.io/badge/GitHub-OsmosisDB-blue?logo=github" alt="GitHub Repository" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" /></a>
  <a href="https://hub.docker.com"><img src="https://img.shields.io/badge/Docker-Ready-blue?logo=docker" alt="Docker Ready" /></a>
  <a href="https://pypi.org"><img src="https://img.shields.io/badge/Python-3.11%2B-blue?logo=python" alt="Python Support" /></a>
</p>

<p align="center">
  <a href="#-what-is-this">🌐 What is this?</a> • 
  <a href="#-getting-started">🚀 Getting Started</a> • 
  <a href="#-system-architecture">📐 Architecture</a> • 
  <a href="#-the-agent-lifecycle">🧠 Agent Lifecycle</a> • 
  <a href="#-configuration-parameters">⚙️ Configuration</a> • 
  <a href="#-rest-api-endpoints">🌐 REST API</a>
</p>

<p align="center">
  🏆 <strong>Safety-First:</strong> Built-in EXPLAIN cost checks • 📊 <strong>Clustering:</strong> UMAP + HDBSCAN workload mapping • 🔄 <strong>Drift Detection:</strong> Cosine centroid drift checks
</p>

<p align="center">
  <strong>Loved by DBAs & Devs:</strong> Automated index suggestions • Zero client code changes • Self-contained sidecar proxy
</p>

---

## 🌐 What is this?

**OsmosisDB** is a lightweight, transparent Layer 4 sidecar database proxy and automated DBA agent system. It sits between your application and PostgreSQL, observes SQL traffic, semantically groups workloads using vector embeddings, detects access pattern drift, and safely applies verified schema index optimizations—all with zero human intervention.

| Feature | Data Formats |
| :--- | :--- |
| **Transparent Wire Proxy** | Postgres v3 Protocol |
| **Workload Clustering** | 384-dimension Vector Embeddings |
| **Drift Tracking** | Centroid Cosine Distance Timeline |
| **Safety Verification** | Pre/Post EXPLAIN Cost Evaluation |

---

## 🚀 Getting Started

### Prerequisites
* Python 3.11 or later
* Node.js 18+ (for dashboard build)
* A running PostgreSQL database
* `libpq-dev` (required for backend compiling)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Abhijeetsingh0022/OsmosisDB.git
   cd osmosisdb
   ```
2. Install python package and dependencies:
   ```bash
   pip install .
   ```
3. Set up configurations:
   ```bash
   cp config.example.toml config.toml
   ```

### Running OsmosisDB
1. Configure your target database DSN in `config.toml`:
   ```toml
   [postgres]
   dsn = "postgresql://user:password@target-host:5432/mydb"
   ```
2. Start the middleware proxy and dashboard API:
   ```bash
   python -m osmosisdb.cli start
   ```
3. Update your application database connection settings to point to the OsmosisDB proxy port:
   * **Host:** `127.0.0.1`
   * **Port:** `6432`

---

## 📐 System Architecture

OsmosisDB runs as a sidecar proxy directly next to your client application or database host:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         APPLICATION CLIENTS                          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  Postgres Wire Protocol (port 6432)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       OSMOSISDB TCP PROXY                            │
│  - Bidirectional forwarding tasks (client⇄server)                    │
│  - Supports TLS & SCRAM-SHA-256                                      │
└───────────┬──────────────────────────────────────────────┬───────────┘
            │  Transparent Forward                         │ Async Push
            ▼                                              ▼
┌─────────────────────────┐                     ┌─────────────────────────┐
│  TARGET DATABASE (NEON) │                     │   QUEUE & SQL RECORDER  │
│  - Production tables    │                     │  - Normalization        │
│  - Batched writes to DB │                     │  - SQLite logging       │
└──────────▲──────────────┘                     └───────────┬─────────────┘
            │ DDL / Explain                                  ▼
┌──────────┴───────────────────────────────────────────────────────────────┐
│                    LOCAL SQLITE PERSISTENT LOGS                          │
│  - Query logs, centroids, drift history, optimization ledger             │
│  - Replica of applied DDL indexes for offline simulation                 │
└──────────▲───────────────────────────────────────────────────────────────┐
            │  Orchestrator Coordination Loop
┌──────────┴───────────────────────────────────────────────────────────────┐
│                        MULTI-AGENT SCHEDULER                             │
│  - Observer Agent  • Learner Agent  • Drift Agent                       │
│  - Planner Agent   • Executor Agent • Benchmark Agent                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 The Agent Lifecycle

Six specialized background agents collaborate continuously to monitor, plan, verify, and execute structural schema improvements:

* **Observer Agent:** Pulls usage statistics, index definitions from `pg_indexes`, scan activity from `pg_stat_user_indexes`, and sequential vs. index scan rates from `pg_stat_user_tables`.
* **Pattern Learner Agent:** Normalizes SQL syntax into parameter-less fingerprints (e.g. `SELECT * FROM users WHERE age > 30` -> `select * from users where age > ?`), encodes SQL text into 384-dimensional vector embeddings via `sentence-transformers/all-MiniLM-L6-v2`, and groups query signatures using UMAP + HDBSCAN.
* **Drift Detector Agent:** Calculates the cosine distance between the centroids of recent query clusters and historical baselines:
  $$\text{Drift} = 1.0 - \frac{A \cdot B}{\|A\| \|B\|}$$
  If the workload drift score exceeds `drift_threshold`, a planning cycle is immediately triggered.
* **Optimization Planner Agent:** Scans query clusters for high-frequency `WHERE` and `JOIN ... ON` columns, matches them against active database indexes, and formulates `CREATE INDEX CONCURRENTLY` proposals and matching `DROP INDEX` rollback scripts.
* **Execution Agent:** Captures pre-optimization planning costs via `EXPLAIN (FORMAT JSON)`, executes the DDL, re-runs `EXPLAIN` on a representative query template, and automatically rolls back the change if cost increases.
* **Benchmark Agent:** Replays representative workloads to compile and record p50, p95, and p99 query latency statistics directly within the database log.

---

## ⚙️ Configuration Parameters

All settings reside in the root `config.toml` file:

| Parameter | Type | Default | Description |
|:---|:---|:---|:---|
| `proxy.listen_host` | String | `"127.0.0.1"` | Host address for the L4 proxy listener |
| `proxy.listen_port` | Integer | `6432` | Port for client connections |
| `postgres.dsn` | String | `""` | Target PostgreSQL connection string |
| `embedding.model` | String | `"all-MiniLM-L6-v2"`| SentenceTransformer model identifier |
| `intelligence.drift_threshold` | Float | `0.3` | Cosine distance before triggering planning |
| `intelligence.pattern_interval_seconds` | Integer | `300` | Frequency of pattern learning cycles |
| `intelligence.min_queries_for_clustering`| Integer | `50` | Minimum fingerprints before running UMAP |
| `approval.mode` | String | `"manual"` | Decision execution mode: `"auto"` or `"manual"`|
| `maintenance.windows` | Array | `["0 2 * * *"]` | Cron schedules for automated optimization runs |

---

## 🌐 REST API Endpoints

FastAPI dashboard server runs on port `8080` by default.

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/queries/recent` | Recent query interceptions and latencies |
| `GET` | `/api/patterns/clusters` | Semantic query clusters and representatives |
| `GET` | `/api/indexes/recommendations` | Active, pending, and rolled-back advisories |
| `POST` | `/api/config` | Update settings and save to `config.toml` |

### Example Query Recommendation (`GET /api/indexes/recommendations`)
```json
[
  {
    "id": 1,
    "optimization_type": "CREATE_INDEX",
    "ddl": "CREATE INDEX CONCURRENTLY \"idx_users_age\" ON \"users\" (\"age\")",
    "rollback_ddl": "DROP INDEX CONCURRENTLY IF EXISTS \"idx_users_age\"",
    "status": "pending",
    "explanation": "Optimizes high-volume sequential scans on 'users' filtering by 'age'."
  }
]
```

---

## 📄 License

OsmosisDB is released under the [MIT License](LICENSE).
