# Contributing to OsmosisDB

Thank you for your interest in contributing to OsmosisDB! As an open-source, autonomous self-tuning PostgreSQL middleware, this project thrives on community contributions. Whether you're reporting a bug, optimizing the clustering algorithms, improving safety checks, or adding UI features to the dashboard, we welcome your help.

Please read through this document to understand our development workflow, coding standards, and how to get your changes merged.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. We expect all contributors to adhere to standard professional conduct, treating others with respect and constructive feedback.

---

## 1. Getting Started

### Prerequisites
Before setting up the project, make sure you have the following installed:
* **Python 3.10** or later
* **Node.js 18+** and **npm**
* **PostgreSQL** (installed locally or accessible via a network connection for end-to-end verification)

### Backend Setup
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/your-username/osmosisdb.git
   cd osmosisdb
   ```
2. Set up a virtual environment and install backend dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -e ".[dev]"
   ```
3. Initialize the development environment:
   ```bash
   cp config.example.toml config.toml
   ```

### Frontend Dashboard Setup
1. Navigate to the dashboard directory:
   ```bash
   cd dashboard
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Start the Vite local development server:
   ```bash
   npm run dev
   ```
   The dashboard UI will be accessible at `http://localhost:5173`.

---

## 2. Architecture & Design Guidelines

Before writing code, it is important to understand the design boundaries of the project:

```
┌─────────────────┐       Postgres Wire       ┌─────────────┐
│  Client App     ├──────────────────────────►│  OsmosisDB  │
└─────────────────┘        (Port 6432)        │  TCP Proxy  │
                                              └──────┬──────┘
                                                     │ Transparent Forward
                                                     ▼
┌─────────────────┐      Introspection / DDL  ┌─────────────┐
│  Admin/REST API ├──────────────────────────►│  Target DB  │
│  (Port 8080)    │                           │  (Postgres) │
└─────────────────┘                           └─────────────┘
```

1. **Transparent L4 Proxy:** The TCP proxy ([server.py](file:///Users/abby/Desktop/OsmosisDB/osmosisdb/proxy/server.py)) must remain a transparent Layer 4 pipeline. Do not introduce raw SSL wrapping or query modifications inside the proxy connection loop; all client-server TLS handshakes must pass through transparently.
2. **Local-First SQLite Storage:** Query logs, drift metrics, and recommendation histories are logged to a thread-safe local SQLite database (`~/.osmosisdb.sqlite`). Do not write heavy logging code that blocks the async event loop.
3. **Safety-First DDL Execution:** All schema recommendations generated in [recommender.py](file:///Users/abby/Desktop/OsmosisDB/osmosisdb/optimizer/recommender.py) must include validation checks (`IDENTIFIER_REGEX` validation) and double-quote SQL identifiers to protect against SQL Injection and keyword collisions.

---

## 3. Coding & Style Standards

To keep the codebase maintainable and clean, please adhere to these standards:

### Python Style Guide
* **PEP 8 Compliance:** Follow PEP 8 formatting. Run `black` or `ruff` to auto-format before committing.
* **Type Hints:** All function signatures and module variables should be fully type-hinted.
* **Imports:** Use absolute imports. Keep imports ordered alphabetically.

### TypeScript / React Style Guide
* **Type Safety:** Avoid using the `any` type. Define explicit interfaces for database records and API responses.
* **CSS variables:** Use CSS custom properties located in `index.css` (e.g. `var(--color-primary)`) to keep dashboard styling consistent.

---

## 4. Verification & Testing

Any pull request must pass all automated verification checks before it can be merged.


### TypeScript Validation
Verify that the React frontend compiles without any type errors:
```bash
cd dashboard
npx tsc --noEmit
```

### Formatting Check
Verify syntax correctness across the Python package:
```bash
python -c "import py_compile; import glob; [py_compile.compile(f) for f in glob.glob('osmosisdb/**/*.py', recursive=True)]"
```

---

## 5. Development Workflow & Pull Requests

1. **Branch Naming:** Create a descriptive branch name from `main`:
   * Bug fixes: `fix/issue-description`
   * Features: `feature/feature-name`
   * Documentation: `docs/what-changed`
2. **Commit Messages:** Write clean, imperative commit messages (e.g., `Add composite index support to rule heuristic engine`).
3. **Submit PR:** Open a Pull Request on GitHub. Ensure the PR description details:
   * What problem this solves.
   * How you tested the changes (include screenshots for UI changes).
   * A checklist of verified code style compliance and test runs.
