# OsmosisDB

### Autonomous Self‑Tuning PostgreSQL Middleware

**OsmosisDB** is a lightweight, transparent Layer 4 sidecar database proxy and automated DBA agent system. It sits between your application and PostgreSQL, observes SQL traffic, semantically groups workloads using vector embeddings, detects access pattern drift, and safely applies verified schema index optimizations—all with zero human intervention.

---

## 🚀 Key Features

* **Transparent Wire Proxy:** Works seamlessly with standard PostgreSQL wire protocol clients, supporting TLS and SCRAM‑SHA‑256 negotiations transparently.
* **Semantic Workload Clustering:** Normalizes SQL inputs, computes 384-dimension embeddings, and clusters queries dynamically using UMAP + HDBSCAN.
* **Automatic Drift Detection:** Measures the cosine distance between current query patterns and historical baselines, triggering re-optimization when workloads shift.
* **Regression-Proof DDL Execution:** Pre-evaluates every proposed index using `EXPLAIN` query planning costs and executes a rollback instantly if plan regression is detected.
* **Offline-Resilient Memory:** Maintains a local SQLite metadata ledger of applied changes and query footprints, generating optimization plans even when the target database is temporarily unreachable.
* **DBA Copilot Interface:** Integrates a local REST API and real-time dashboard featuring live diagnostic feeds, telemetry graphs, and a chatbot copilot.

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
│  - Catalog statistics   │                     │  - Batched writes to DB │
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

### 1. Observer Agent
Pulls usage statistics and metadata from PostgreSQL catalog tables:
* **Index definitions** from `pg_indexes`.
* **Index scan activity** from `pg_stat_user_indexes`.
* **Sequential vs. index scan rates** from `pg_stat_user_tables`.

### 2. Pattern Learner Agent
Extracts access patterns from intercepted queries:
1. Normalizes SQL syntax into parameter-less fingerprints (e.g. `SELECT * FROM users WHERE age > 30` → `select * from users where age > ?`).
2. Encodes SQL text into a 384-dimensional dense vector using the `sentence-transformers/all-MiniLM-L6-v2` model.
3. Groups query signatures using **UMAP** dimension reduction and **HDBSCAN** clustering.
4. Falls back to direct template categorization when the template count is below the clustering threshold (`min_queries_for_clustering`).

### 3. Drift Detector Agent
Calculates the **cosine distance** between the centroids of recent query clusters and historical baselines:
$$\text{Drift} = 1.0 - \frac{A \cdot B}{\|A\| \|B\|}$$
If the workload drift score exceeds `drift_threshold`, a planning cycle is immediately triggered.

### 4. Optimization Planner Agent
Recommends targeted schema changes:
* Scans query clusters for high-frequency `WHERE` and `JOIN ... ON` columns.
* Matches column sets against active database indexes.
* Formulates `CREATE INDEX CONCURRENTLY` proposals and matching `DROP INDEX` rollback scripts.

### 5. Execution Agent
Applies DDL statements during scheduled maintenance windows:
1. Captures pre-optimization planning costs via `EXPLAIN (FORMAT JSON)`.
2. Executes the optimization DDL.
3. Re-runs `EXPLAIN (FORMAT JSON)` on a representative query template.
4. Compares post-optimization cost against the baseline. If cost increases, the change is **automatically rolled back** to protect database integrity.

### 6. Benchmark Agent
Replays representative workloads to compile and record p50, p95, and p99 query latency statistics directly within the database log.

---

## 🛠️ Getting Started

### Prerequisites
* Python 3.11 or later
* Node.js 18+ (for dashboard build)
* A running PostgreSQL database
* `libpq-dev` (required for backend compiling)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/osmosisdb.git
   cd osmosisdb
   ```
2. Install python package and dependencies:
   ```bash
   pip install -r requirements.txt
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
