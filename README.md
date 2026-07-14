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
  <a href="https://github.com/Abhijeetsingh0022/OsmosisDB"><img src="https://img.shields.io/badge/Website-osmosisdb-blue?logo=html5&logoColor=white" alt="Website" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" /></a>
  <a href="https://hub.docker.com"><img src="https://img.shields.io/badge/Docker-Ready-blue?logo=docker&logoColor=white" alt="Docker Ready" /></a>
  <a href="https://pypi.org"><img src="https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white" alt="Python Support" /></a>
</p>

<p align="center">
  <a href="#-what-is-this">🌐 Browse Features</a> • 
  <a href="#-interactive-dashboard--dba-copilot">🖥️ Dashboard & Copilot</a> • 
  <a href="#-quick-start--self-hosting">🚀 Self-Host</a> • 
  <a href="#-integrations">🔌 Integrations</a> • 
  <a href="#-sponsors">💖 Sponsors</a>
</p>

<p align="center">
  🏆 <strong>Safety-First:</strong> Automated index checks · 📊 <strong>Clustering:</strong> UMAP + HDBSCAN workload mapping · 🔄 <strong>Drift Tracking:</strong> Cosine centroid drift checks
</p>

<p align="center">
  <strong>Loved by DBAs & Developers:</strong>
  <br />
  Automated index suggestions · Zero client-side code changes · Self-contained sidecar proxy
</p>

---

## 🌐 What is this?

A curated, autonomous middleware for index lifecycle management on PostgreSQL. By routing application SQL traffic through the transparent sidecar proxy, OsmosisDB identifies missing index structures, builds them concurrently, evaluates cost verification benchmarks, and rolls back regressions automatically.

| Browse Features | Data Formats |
| :--- | :--- |
| **Transparent Wire Proxy** | Postgres v3 Protocol |
| **Workload Clustering** | 384-dimension Vector Embeddings |
| **Drift Tracking** | Centroid Cosine Distance Timeline |
| **Safety Verification** | Pre/Post EXPLAIN Cost Evaluation |

Want to contribute? Check out [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

---

## 🖥️ Interactive Dashboard & DBA Copilot

OsmosisDB comes out-of-the-box with a responsive web dashboard served locally. It features:
* **Advisory Queue:** Approve index suggestions, review expected performance improvements, and rollback completed optimizations.
* **Workload Map:** View real-time cluster labels and active query template mappings.
* **DBA Copilot:** A chatbot powered by LLM heuristics to answer questions about latency, drift scores, and index health.
* **SQL AST Sandbox:** Test-parse SQL syntax on-the-fly to preview generated index DDLs.

---

## 🚀 Quick Start & Self-Hosting

Deploy your own private tuning sidecar with custom configurations.

### Quick Start (Local Setup)

```bash
# Clone the repository
git clone https://github.com/Abhijeetsingh0022/OsmosisDB.git
cd OsmosisDB

# Install dependencies
pip install .

# Setup local configurations
cp config.example.toml config.toml
```

Configure your target database credentials inside `config.toml`, then start the middleware:
```bash
python -m osmosisdb.cli start
```

### Docker Setup

Build and run the sidecar using Docker:
```bash
docker build -t osmosisdb .
docker run -p 6432:6432 -p 8080:8080 --env OSMOSIS_POSTGRES__DSN="postgresql://user:password@target-host:5432/mydb" osmosisdb
```

Recommended database: OsmosisDB uses PostgreSQL. For a hosted serverless database, we recommend **Neon**.

---

## 🔌 Integrations

### CLI
```bash
osmosisdb start --config config.toml
```

### REST API Endpoints
All local statistics are exposed via the FastAPI interface (default port `8080`):

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/queries/recent` | Recent query interceptions and latencies |
| `GET` | `/api/patterns/clusters` | Semantic query clusters and representatives |
| `GET` | `/api/indexes/recommendations` | Active, pending, and rolled-back advisories |
| `POST` | `/api/config` | Update settings and save to `config.toml` |

---

## 🧠 The Agentic Tuning Cycle

Six background agents coordinate the optimization loop:

1. **Observer Agent:** Gathers table and index usage metadata from PostgreSQL catalog tables (`pg_indexes`, `pg_stat_user_indexes`, `pg_stat_user_tables`).
2. **Pattern Learner Agent:** Normalizes queries into fingerprints, generates vector embeddings using `all-MiniLM-L6-v2`, and maps them into UMAP + HDBSCAN clusters.
3. **Drift Detector Agent:** Computes the cosine distance between the current and historical cluster centroids:
   $$\text{Drift} = 1.0 - \frac{A \cdot B}{\|A\| \|B\|}$$
   Triggers planners immediately if drift exceeds `drift_threshold`.
4. **Optimization Planner Agent:** Formulates safe index creation (`CREATE INDEX CONCURRENTLY`) and drop statements for column accesses.
5. **Execution Agent:** Runs query plan validations before and after index creation using `EXPLAIN (FORMAT JSON)`, rolling back any optimizations that increase cost.
6. **Benchmark Agent:** Performs median, peak, and outlier latency checks (p50/p95/p99) on target queries post-optimization.

---

## ⚙️ Configuration Parameters

Settings reside in `config.toml` at the project root:

| Parameter | Type | Default | Description |
|:---|:---|:---|:---|
| `proxy.listen_host` | String | `"127.0.0.1"` | Host address for the L4 proxy listener |
| `proxy.listen_port` | Integer | `6432` | Port for client connections |
| `postgres.dsn` | String | `""` | Target PostgreSQL connection string |
| `embedding.model` | String | `"all-MiniLM-L6-v2"`| SentenceTransformer model identifier |
| `intelligence.drift_threshold` | Float | `0.3` | Cosine distance before triggering planning |
| `intelligence.pattern_interval_seconds` | Integer | `300` | Frequency of pattern learning cycles |
| `intelligence.min_queries_for_clustering`| Integer | `50` | Minimum fingerprints before running UMAP |
| `approval.mode` | String | `"manual"` | Decision execution: `"auto"` or `"manual"` |
| `maintenance.windows` | Array | `["0 2 * * *"]` | Cron schedules for automated DDL execution |

---

## 💖 Sponsors

Become a sponsor to support autonomous database optimization tooling.

[Become a Sponsor →](https://github.com/Abhijeetsingh0022/OsmosisDB)

---

## 👥 Contributors

This project is built and maintained by the OsmosisDB open-source community.

---

## 📜 License

This project is dual-licensed:
* Source code and site dashboard content are licensed under the **[MIT License](LICENSE-MIT)**.
* Query templates, access patterns, and collected workload logs are dedicated to the public domain under **[CC0 1.0 Universal](LICENSE-CC0)**.

See **[LICENSE](LICENSE)** for the full policy details.
