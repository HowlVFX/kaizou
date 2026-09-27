<div align="center">

# 🧠 Kaizou

### Verified knowledge retention on a node-based knowledge graph

*Write notes. The system builds a knowledge graph from them, then proves whether you actually understand what you wrote — with deterministic math, not an LLM's opinion.*

</div>

---

## What is this?

Most study tools store notes as isolated fragments and measure learning by asking you how confident you feel. Second Brain does neither. Every note you write is automatically turned into one or more **concept nodes** on a personal **knowledge graph**, connected by typed edges — explicit links, semantic similarity, and prerequisite (`REQUIRES`) relationships. The system then tracks how well you retain each concept over time and tests whether you *understand* it, not just whether you can recall it.

The research idea at the core of the project is a strict separation of concerns:

> **The LLM generates. Deterministic math grades.**

A large language model is used only to turn prose into structured objects (atomic claims, prerequisites, ordered process templates). It never produces a score or a verdict. Every grade you ever see is transparent, reproducible arithmetic — claim coverage, ordering, precision, and an anti-copy penalty. This makes the system's measurements auditable, which is the whole point.

### Highlights

- 🕸️ **Automatic knowledge graph** — notes become nodes; links, semantic proximity, and prerequisites become edges. Nodes are coloured by how well you're predicted to recall them.
- ⚖️ **Deterministic grading** — no LLM-as-judge anywhere in the grading path. Coverage, Kendall-tau ordering, precision, verbatim penalty, and branch leakage, combined into a categorical understanding band.
- 🧩 **Understanding, not recall** — probe types grounded in cognitive science: the illusion of explanatory depth, the SOLO taxonomy, expert–novice concept sorting, near/far transfer, misconception distractors, and counterfactual perturbation.
- ⏳ **Complexity-adjusted memory model** — a per-concept forgetting curve with a half-life that adapts to your performance and the concept's difficulty. Recall is computed on read — no nightly batch job.
- 🔍 **Exact semantic search** — pgvector with exact k-NN (no approximate index), so graph structure is never corrupted by a fuzzy match.
- 📊 **Cognitive dashboard + management portal** — three complementary signals per learner, plus privacy-preserving cross-user aggregates for administrators.

---

## Architecture

Second Brain is four runnable services over one PostgreSQL + pgvector database.

```
┌─────────────────────┐     ┌─────────────────────┐
│  Learner Web App     │     │  Management Portal   │
│  KNODES-main/  :8443 │     │  portal/       :5174 │
│  React + Vite        │     │  React + Vite        │
└──────────┬──────────┘     └──────────┬──────────┘
           │  REST / JSON              │  REST / JSON (read-only)
           ▼                            ▼
┌──────────────────────────────────────────────────┐
│  Express Learner API   (root)              :3000   │
│  auth · notes · concepts · graph · review · portal │
└──────────┬─────────────────────────────────────────┘
           │  internal HTTP (X-Internal-Key)
           ▼
┌──────────────────────────────────────────────────┐
│  FastAPI Intelligence Layer   fastapi/     :8000   │
│  ingestion · deterministic grading · graph linking │
│  clustering · memory scheduler · evaluation        │
└──────────┬─────────────────────────────────────────┘
           │  SQL
           ▼
┌──────────────────────────────────────────────────┐
│  PostgreSQL 16 + pgvector   (exact k-NN, 1536-dim) │
└──────────────────────────────────────────────────┘
```

| Component | Path | Stack | Default port |
|---|---|---|---|
| Learner API | `.` (root) | Node.js, Express 5 | `3000` |
| Intelligence layer | `fastapi/` | Python 3.11+, FastAPI, uvicorn | `8000` |
| Learner frontend | `KNODES-main/` | React 19, Vite, Tailwind v4 | `8443` |
| Management portal | `portal/` | React 19, Vite | `5174` |
| Database | `database/` | PostgreSQL 16 + pgvector | `5432` |

AI provider keys live **only** in `fastapi/.env`. Express proxies to FastAPI and never holds them.

---

## 🚀 Quickstart

> **TL;DR** — one database, then four terminals: Express, FastAPI, learner app, portal.

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (for the FastAPI service)
- **PostgreSQL** 16 with the [`pgvector`](https://github.com/pgvector/pgvector) extension (a hosted [Neon](https://neon.tech) database works too)
- A **Google AI Studio** API key for embeddings and Gemini generation ([get one here](https://aistudio.google.com/apikey))

### 1. Clone and enter the project

```bash
git clone https://github.com/HowlVFX/kaizou.git
cd kaizou
```

### 2. Create the database

Create a Postgres database and enable the extensions, then load the schema:

```bash
# create a database named "kaizou" (or use your hosted connection string)
psql -U postgres -c "CREATE DATABASE kaizou;"

# load the schema (creates the pgvector + pgcrypto extensions and all tables)
psql -U postgres -d kaizou -f database/schema.sql
```

### 3. Configure environment variables

Two `.env` files are needed. Copy the examples and fill in the blanks — **never commit `.env` files** (they are git-ignored).

```bash
cp .env.example .env                 # Express (root)
cp fastapi/.env.example fastapi/.env  # FastAPI
```

Minimum you must set:

| File | Key | What to put |
|---|---|---|
| `.env` | `DATABASE_URL` | your Postgres connection string |
| `.env` | `JWT_SECRET`, `ADMIN_JWT_SECRET` | two different random secrets |
| `.env` | `INTERNAL_API_KEY` | a shared secret (see below) |
| `fastapi/.env` | `DATABASE_URL` | the same connection string |
| `fastapi/.env` | `INTERNAL_API_KEY` | **must equal** the one in `.env` |
| `fastapi/.env` | `GEMINI_API_KEY` | your Google AI Studio key |

Generate a strong shared key and paste the same value into both files:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

> 💡 For a quick local run without any AI keys, the deterministic engine (grading, graph, memory) still works. Only ingestion/extraction and embeddings require the Gemini key.

### 4. Start the Express learner API

```bash
npm install
npm run dev
# → http://localhost:3000
```

### 5. Start the FastAPI intelligence layer

In a **new terminal**:

```bash
cd fastapi
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

pip install -e .
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# → http://localhost:8000  (interactive docs at /docs)
```

Contradiction detection uses a local NLI model that is **optional** and off the default install (keeps the image lean). To enable it:

```bash
pip install -e ".[nli]"
pip install torch --index-url https://download.pytorch.org/whl/cpu
# then set NLI_ENABLED=true in fastapi/.env
```

### 6. Start the learner frontend

In a **new terminal**:

```bash
cd KNODES-main
npm install
npm run dev
# → http://localhost:8443
```

### 7. (Optional) Start the management portal

In a **new terminal**:

```bash
cd portal
npm install
npm run dev
# → http://localhost:5174
```

Open **http://localhost:8443**, sign up, write your first note, and watch it appear on the graph. 🎉

---

## ⚙️ Configuration reference

The `.env.example` files are heavily commented — read them for the full list. The most important knobs:

**Express (`.env`)**
- `DATABASE_URL` — Postgres connection string.
- `JWT_SECRET` / `ADMIN_JWT_SECRET` — separate signing keys for learner and admin tokens.
- `INTERNAL_API_KEY` — shared secret for Express → FastAPI calls (`X-Internal-Key`). Must match `fastapi/.env`.
- `CORS_ORIGIN` — comma-separated allowlist (defaults to the learner app on `:8443` and the portal on `:5174`).
- `FASTAPI_URL` — where Express reaches the intelligence layer (default `http://localhost:8000`).
- `GITHUB_*` / `GOOGLE_*` — OAuth client credentials (optional; email/password works without them).

**FastAPI (`fastapi/.env`)**
- `GEMINI_API_KEY` — one Google key covers both embeddings and Gemini generation.
- `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` — must match the `vector(N)` columns in `database/schema.sql` (1536).
- `AI_BUDGET_INR` — a hard ceiling on estimated AI spend; when hit, paid calls are refused (HTTP 402) but deterministic features keep working.
- `NLI_ENABLED` — turn on local contradiction detection (requires the `nli` extra).

---

## 🗂️ Repository layout

```
.
├── app.js                 # Express entrypoint (learner API)
├── routes/                # auth, notes, concepts, graph, review, analytics, ...
├── services/              # business logic + FastAPI proxy
├── middleware/            # auth, gate, internal-key checks
├── database/
│   ├── schema.sql         # full schema: extensions, enums, tables, indexes
│   └── migrations/        # incremental SQL migrations
├── fastapi/
│   ├── app/
│   │   ├── grading/       # coverage, ordering, precision, verbatim, composite, contradiction
│   │   ├── memory/        # decay, mastery, complexity, telemetry, scheduler
│   │   ├── graph/         # linking, clustering (Louvain), prerequisites, paths
│   │   ├── ingestion/     # extraction, embedding, classification
│   │   ├── evaluation/    # metrics, baselines, simulator
│   │   └── main.py        # FastAPI app
│   └── pyproject.toml
├── KNODES-main/           # learner frontend (React + Vite + Tailwind)
└── portal/                # management portal (React + Vite)
```

---

## 🧮 How grading works (the short version)

When you submit an explanation, the intelligence layer:

1. Embeds your answer and matches each sentence against the concept's required claims using cosine similarity (greedy-max, threshold `τ = 0.82`).
2. Computes four deterministic sub-scores:
   - **coverage** — weighted share of required claims you reached (state-transition claims count more).
   - **ordering** — Kendall's τ_b between your order and the canonical order.
   - **precision** — how much of what you asserted was actually supported.
   - **verbatim penalty** — longest common token run vs. the source (anti-copy, with a dead zone).
3. Combines them: `score = clamp(0.55·coverage + 0.15·ordering + 0.30·precision − 0.20·verbatim − 0.25·leakage, 0, 1)`.
4. Maps the score to a **category** (Full / Shallow / Incomplete / Not yet engaged) — you never see the raw number — plus a ranked **gap report** of what you missed.

Retention is a forgetting curve, `R = 2^(−Δt / h)`, with the half-life `h` growing more when you succeed against low predicted recall (the spacing effect) and shrinking on failure.

*A full write-up of every formula, the psychological foundations, and the complete diagram set lives in the project report under `../_report/`.*

---

## 🧪 Testing

The deterministic functions are pure, so they are directly unit-testable:

```bash
cd fastapi
pip install -e ".[dev]"
pytest
```

Because the system's central claims are about retention over weeks, evaluation is run against a **seeded corpus** and a **simulated learner** (`fastapi/app/evaluation/`) so that calibration, discrimination, and grader-vs-human agreement can be measured without waiting for real calendar time.

---

## 🔒 Security & privacy notes

- AI provider keys live **only** in `fastapi/.env`; the frontends and Express never receive them.
- All `.env` files are git-ignored — commit only `.env.example`.
- The management portal is read-only, enforces a minimum cohort size before surfacing any metric, and stores **no** free-text note or answer content.
- Semantic search is exact k-NN; approximate indexes are deliberately avoided.

---

## 📄 License

ISC. See `package.json`.

<div align="center">
<sub>Built as a final-year BSc Computer Science project · University of Mumbai · 2026–2027</sub>
</div>
