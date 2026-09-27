# Kaizou — Architecture Audit

**Date:** 2026-09-25
**Scope:** Structural scaffolding pass — no business logic implemented
**Authority:** `_references/second-brain-master-design.md` (v3 consolidated)

---

## 1. Existing Implementation

### 1.1 Backend (Express.js — JavaScript/CommonJS)

| File | Purpose | Status |
|---|---|---|
| `app.js` | Express entry point, route mounting, CORS | ✅ Extended |
| `package.json` | Dependencies: express 5, pg, bcrypt, jsonwebtoken, cors, dotenv | ✅ Retained |
| `database/db.js` | PostgreSQL connection pool via `pg` | ✅ Retained |
| `database/schema.sql` | Database DDL | 🔄 Replaced (extended from 3 → 19 tables) |
| `middleware/auth.js` | JWT verification middleware | ✅ Retained |
| `routes/auth.js` | POST /signup, POST /login with bcrypt + JWT | ✅ Retained |
| `routes/notes.js` | GET/POST/PUT/DELETE for notes (learner-scoped) | ✅ Retained |
| `routes/oauth.js` | GitHub + Google OAuth flows | ✅ Retained |
| `routes/users.js` | GET/PUT /me for learner profile | ✅ Retained |
| `migrate.js` | Basic schema runner | ✅ Retained |
| `neon.ts` | Unused TypeScript import | ⚠️ Retained (not deleted) |

### 1.2 Frontend (KNODES-main — React 19 / Vite / TypeScript)

| Component | Purpose | Status |
|---|---|---|
| `src/App.tsx` | Routing with auth guard | ✅ Retained |
| `src/context/AppContext.tsx` | Global state (auth, notes, graph, prefs) | ✅ Retained |
| `src/pages/LandingPage.tsx` | Marketing landing page | ✅ Retained |
| `src/pages/AuthPage.tsx` | Login/signup forms | ✅ Retained |
| `src/pages/AuthCallbackPage.tsx` | OAuth callback handler | ✅ Retained |
| `src/pages/BrainPage.tsx` | Knowledge graph dashboard | ✅ Retained |
| `src/pages/NotesPage.tsx` | Markdown editor with pipeline viz | ✅ Retained |
| `src/pages/RetestPage.tsx` | Spaced repetition test interface | ✅ Retained |
| `src/pages/InsightsPage.tsx` | Analytics dashboard | ✅ Retained |
| `src/pages/ProfilePage.tsx` | Settings/preferences | ✅ Retained |
| `src/components/KnowledgeGraph.tsx` | Custom SVG graph visualization | ✅ Retained |
| `src/components/AppShell.tsx` | Layout with navigation | ✅ Retained |
| `src/data/demo.ts` | Rich mock data (1100+ lines) | ✅ Retained |
| `src/types/index.ts` | GraphNode, GraphEdge, Note, Cluster types | ✅ Retained |

### 1.3 Documentation

| File | Status |
|---|---|
| `README.md` | ✅ Retained |
| `code_walkthrough.md` | ✅ Retained |
| `context.md` | ✅ Retained |
| `.gitignore` | ✅ Retained |

---

## 2. Reused (Left Intact)

The following were already correct and compatible with the master design:

- **JWT auth middleware** (`middleware/auth.js`) — standard Bearer token verification
- **Auth routes** (`routes/auth.js`) — signup/login with bcrypt + JWT, uses `learners` table naming
- **Notes CRUD** (`routes/notes.js`) — learner-scoped CRUD with ownership checks
- **OAuth flows** (`routes/oauth.js`) — GitHub + Google OAuth with user creation
- **User profile** (`routes/users.js`) — includes `preferred_language` and `portal_optin` fields
- **Database connection** (`database/db.js`) — pg Pool with SSL support
- **Entire frontend** (`KNODES-main/`) — all pages, components, graph viz, demo data
- **Frontend types** (`KNODES-main/src/types/index.ts`) — GraphNode already includes recall, halfLife, solo, claims, prerequisites, process

### Why preserved

The existing backend correctly uses the master design's terminology (`learners` not `users`, `body_md` field semantics, `preferred_language`, `portal_optin`). The schema was already partially aligned. The frontend is high-quality with polished UI/UX including custom SVG knowledge graph, markdown editor, and spaced repetition interface — all directly serving the learner application's needs.

---

## 3. Reorganized

### 3.1 `app.js` — Extended, not rewritten

**What changed:**
- Removed inline `/api/management/overview` placeholder route
- Added mounts for 6 new learner route modules
- Added mounts for 11 management route modules under `/api/management/`
- Made CORS origin configurable via `CORS_ORIGIN` env var
- Made PORT configurable via `PORT` env var

**What was preserved:**
- All existing route mounts (auth, oauth, users, notes)
- Express.json() middleware
- Overall app structure

### 3.2 `database/schema.sql` — Replaced and extended

**Rationale:** The existing schema had only 3 tables (`learners`, `refresh_tokens`, `notes`). The master design requires 19 tables. Rather than creating a complex migration from the old to new, we replaced the schema file with the complete design. The existing column definitions were preserved where they overlapped (e.g., `learners.email`, `learners.password_hash`, `learners.role`, `learners.preferred_language`, `learners.portal_optin`).

---

## 4. Missing (Was Absent Before This Pass)

Everything beyond basic auth and notes CRUD was missing:

- **Concepts, claims, edges** — no schema, no routes, no types
- **Knowledge graph computation** — frontend had visualization but used mock data
- **Ingestion pipeline** — frontend simulated it visually; no backend processing
- **Source retrieval/validation** — entirely absent
- **Grading system** — entirely absent
- **Memory/decay model** — entirely absent
- **Probe generation** — entirely absent
- **Review queue** — entirely absent (frontend had mock)
- **Clustering** — entirely absent
- **Learning paths** — entirely absent
- **Job system** — entirely absent
- **Evaluation harness** — entirely absent
- **Management portal** — entirely absent (one inline placeholder route existed)
- **FastAPI backend** — entirely absent
- **Shared types package** — entirely absent
- **Database migrations** — only a basic script existed

---

## 5. Scaffolded (Newly Created)

### 5.1 Database

| File | Contents |
|---|---|
| `database/schema.sql` | Complete PostgreSQL schema: pgvector extension, 18 enum types, 19 tables, 12+ indexes, constraints, comments |
| `database/migrations/001_initial_schema.sql` | Initial migration |
| `database/seeds/README.md` | Seeded corpus placeholder documentation |

### 5.2 FastAPI Backend (`fastapi/`)

| Module | Files | Purpose |
|---|---|---|
| Root | `pyproject.toml`, `README.md`, `.env.example` | Project config |
| Core | `app/main.py`, `app/config.py`, `app/dependencies.py` | App entry, settings, DI |
| Ingestion | `router.py`, `schemas.py`, `service.py`, `classifier.py`, `extractor.py`, `identity.py`, `embedding.py` | Note ingestion pipeline |
| Retrieval | `router.py`, `schemas.py`, `search.py`, `fetcher.py`, `snapshot.py`, `service.py` | Source retrieval/validation |
| Grading | `router.py`, `schemas.py`, `coverage.py`, `ordering.py`, `precision.py`, `verbatim.py`, `contradiction.py`, `composite.py`, `gap_report.py` | Deterministic grading |
| Memory | `decay.py`, `mastery.py`, `scheduler.py`, `service.py` | Memory decay/curriculum |
| Graph | `linking.py`, `prerequisites.py`, `clustering.py`, `lineage.py`, `paths.py` | Graph computation |
| Probes | `router.py`, `schemas.py`, `templates.py`, `generation.py`, `leakage.py`, `service.py` | Probe generation |
| Evaluation | `corpus.py`, `simulator.py`, `baselines.py`, `metrics.py` | Evaluation harness |
| Jobs | `worker.py`, `dispatcher.py`, `handlers.py`, `repository.py` | DB-backed job queue |

### 5.3 Express Routes (New)

| File | Endpoints | Type |
|---|---|---|
| `routes/concepts.js` | GET /, GET /:id, GET /gaps/list | Learner |
| `routes/graph.js` | GET /, GET /edges, GET /neighbors/:id | Learner |
| `routes/clusters.js` | GET /, GET /:id | Learner |
| `routes/review.js` | GET /queue | Learner |
| `routes/analytics.js` | GET /personal | Learner |
| `routes/learning-paths.js` | GET /concept/:id, GET /cluster/:id | Learner |
| `routes/management/overview.js` | GET / | Management (read-only) |
| `routes/management/population.js` | GET / | Management (read-only) |
| `routes/management/grader.js` | GET / | Management (read-only) |
| `routes/management/memory.js` | GET / | Management (read-only) |
| `routes/management/probes.js` | GET / | Management (read-only) |
| `routes/management/graph.js` | GET / | Management (read-only) |
| `routes/management/sources.js` | GET / | Management (read-only) |
| `routes/management/generation.js` | GET / | Management (read-only) |
| `routes/management/clusters.js` | GET / | Management (read-only) |
| `routes/management/evaluation.js` | GET / | Management (read-only) |
| `routes/management/exports.js` | GET /:reportType | Management (read-only) |
| `middleware/management-auth.js` | Admin role verification | Middleware |

### 5.4 Shared Types (`packages/types/`)

- `package.json`, `tsconfig.json`
- `src/index.ts` — 17 enums, 18 domain interfaces, 6 DTO interfaces, 2 portal DTOs

### 5.5 Management Portal (`portal/`)

- Complete Vite + React 19 + TypeScript scaffold
- 12 page components (Login, Overview, Population, Grader, Memory, Probes, Graph, Sources, Generation, Clusters, Evaluation, Export)
- Layout shell with sidebar navigation
- Auth guard for admin role
- Dark theme CSS
- All pages are stubs with TODO comments listing specific master design metrics

### 5.6 Configuration

- `.env.example` (Express)
- `fastapi/.env.example` (FastAPI)

---

## 6. Database Design

### Schema Overview

The schema implements 19 tables across 5 functional areas:

**Core entities:** `learners`, `refresh_tokens`, `notes`, `concepts`, `note_concepts`, `claims`
**Graph:** `edges`, `sources`, `validations`
**Testing:** `process_templates`, `probes`, `attempts`, `misconception_events`, `memory_states`
**Clustering:** `clusters`, `cluster_members`, `cluster_lineage`
**Infrastructure:** `jobs`, `portal_aggregates`

### Key Design Decisions

1. **UUID primary keys** — All tables use `gen_random_uuid()` for globally unique, non-sequential IDs
2. **Concept versioning (D-04)** — `claims`, `process_templates`, `probes`, and `attempts` carry `concept_version`. Historical grades remain associated with the version they were graded against
3. **Composite primary key on `memory_states`** — `(concept_id, learner_id)` per the master design's one-memory-state-per-concept rule
4. **pgvector with exact k-NN (D-03 locked)** — `vector(1536)` columns on `concepts.label_embedding` and `claims.embedding`. **No HNSW or IVFFlat indexes** — the design explicitly requires exact k-NN to prevent silent match drops that would produce grading errors
5. **Privacy boundary (D-10)** — `portal_aggregates` contains NO free-text columns. Only `metric_key`, `value`, `sample_size`, and `dimensions` (JSONB for structured metadata only)
6. **Job system (D-13)** — `jobs` table with `locked_by`/`locked_at` for worker claiming via `UPDATE ... RETURNING`. No Redis/Celery
7. **Embedding dimension** — Set to 1536 (OpenAI ada-002 compatible). TODO: adjust to match chosen embedding model
8. **Cascade behavior** — All learner-owned tables cascade on learner delete. Source/validation chains cascade appropriately

---

## 7. Architecture — Final Repository Structure

```
second_brain-main/
├── app.js                          # [MODIFIED] Express entry point
├── package.json                    # [RETAINED] Backend dependencies
├── .env.example                    # [CREATED] Environment template
├── migrate.js                      # [RETAINED] Basic migration runner
├── README.md                       # [RETAINED]
├── code_walkthrough.md             # [RETAINED]
├── context.md                      # [RETAINED]
├── ARCHITECTURE_AUDIT.md           # [CREATED] This document
│
├── database/
│   ├── db.js                       # [RETAINED] PG connection pool
│   ├── schema.sql                  # [REPLACED] Complete 19-table schema
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # [CREATED] Initial migration
│   └── seeds/
│       └── README.md               # [CREATED] Corpus placeholder
│
├── middleware/
│   ├── auth.js                     # [RETAINED] JWT verification
│   └── management-auth.js          # [CREATED] Admin role guard
│
├── routes/
│   ├── auth.js                     # [RETAINED] Signup/login
│   ├── oauth.js                    # [RETAINED] GitHub/Google OAuth
│   ├── users.js                    # [RETAINED] Profile management
│   ├── notes.js                    # [RETAINED] Notes CRUD
│   ├── concepts.js                 # [CREATED] Concept routes (stub)
│   ├── graph.js                    # [CREATED] Graph routes (stub)
│   ├── clusters.js                 # [CREATED] Cluster routes (stub)
│   ├── review.js                   # [CREATED] Review queue (stub)
│   ├── analytics.js                # [CREATED] Analytics routes (stub)
│   ├── learning-paths.js           # [CREATED] Learning paths (stub)
│   └── management/
│       ├── overview.js             # [CREATED] (stub, GET-only)
│       ├── population.js           # [CREATED] (stub, GET-only)
│       ├── grader.js               # [CREATED] (stub, GET-only)
│       ├── memory.js               # [CREATED] (stub, GET-only)
│       ├── probes.js               # [CREATED] (stub, GET-only)
│       ├── graph.js                # [CREATED] (stub, GET-only)
│       ├── sources.js              # [CREATED] (stub, GET-only)
│       ├── generation.js           # [CREATED] (stub, GET-only)
│       ├── clusters.js             # [CREATED] (stub, GET-only)
│       ├── evaluation.js           # [CREATED] (stub, GET-only)
│       └── exports.js              # [CREATED] (stub, GET-only)
│
├── fastapi/                        # [CREATED] Entire directory
│   ├── pyproject.toml
│   ├── README.md
│   ├── .env.example
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── config.py
│       ├── dependencies.py
│       ├── ingestion/
│       │   ├── __init__.py
│       │   ├── router.py
│       │   ├── schemas.py
│       │   ├── service.py
│       │   ├── classifier.py
│       │   ├── extractor.py
│       │   ├── identity.py
│       │   └── embedding.py
│       ├── retrieval/
│       │   ├── __init__.py
│       │   ├── router.py
│       │   ├── schemas.py
│       │   ├── search.py
│       │   ├── fetcher.py
│       │   ├── snapshot.py
│       │   └── service.py
│       ├── grading/
│       │   ├── __init__.py
│       │   ├── router.py
│       │   ├── schemas.py
│       │   ├── coverage.py
│       │   ├── ordering.py
│       │   ├── precision.py
│       │   ├── verbatim.py
│       │   ├── contradiction.py
│       │   ├── composite.py
│       │   └── gap_report.py
│       ├── memory/
│       │   ├── __init__.py
│       │   ├── decay.py
│       │   ├── mastery.py
│       │   ├── scheduler.py
│       │   └── service.py
│       ├── graph/
│       │   ├── __init__.py
│       │   ├── linking.py
│       │   ├── prerequisites.py
│       │   ├── clustering.py
│       │   ├── lineage.py
│       │   └── paths.py
│       ├── probes/
│       │   ├── __init__.py
│       │   ├── router.py
│       │   ├── schemas.py
│       │   ├── templates.py
│       │   ├── generation.py
│       │   ├── leakage.py
│       │   └── service.py
│       ├── evaluation/
│       │   ├── __init__.py
│       │   ├── corpus.py
│       │   ├── simulator.py
│       │   ├── baselines.py
│       │   └── metrics.py
│       └── jobs/
│           ├── __init__.py
│           ├── worker.py
│           ├── dispatcher.py
│           ├── handlers.py
│           └── repository.py
│
├── packages/
│   └── types/                      # [CREATED] Shared TS types
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
│
├── portal/                         # [CREATED] Management portal
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── components/
│       │   ├── PortalShell.tsx
│       │   └── PortalAuthGuard.tsx
│       └── pages/
│           ├── LoginPage.tsx
│           ├── OverviewPage.tsx
│           ├── PopulationPage.tsx
│           ├── GraderPage.tsx
│           ├── MemoryPage.tsx
│           ├── ProbesPage.tsx
│           ├── GraphPage.tsx
│           ├── SourcesPage.tsx
│           ├── GenerationPage.tsx
│           ├── ClustersPage.tsx
│           ├── EvaluationPage.tsx
│           └── ExportPage.tsx
│
├── KNODES-main/                    # [RETAINED] Learner frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── context/AppContext.tsx
│       ├── types/index.ts
│       ├── data/demo.ts
│       ├── pages/
│       │   ├── LandingPage.tsx
│       │   ├── AuthPage.tsx
│       │   ├── AuthCallbackPage.tsx
│       │   ├── BrainPage.tsx
│       │   ├── NotesPage.tsx
│       │   ├── RetestPage.tsx
│       │   ├── InsightsPage.tsx
│       │   └── ProfilePage.tsx
│       └── components/
│           ├── AppShell.tsx
│           ├── KnowledgeGraph.tsx
│           ├── ConceptExplorer.tsx
│           ├── ClusterExplorer.tsx
│           ├── PathLearning.tsx
│           ├── ExplainOverlay.tsx
│           └── Icon.tsx
│
└── _references/                    # [RETAINED] Design documents
    ├── second-brain-master-design.md
    ├── second-brain-project-brief.md
    ├── second-brain-scope.md
    └── second-brain-system-analysis.md
```

---

## 8. Service Boundaries

### Write Ownership (🔒 Locked Decision)

| Service | Owns Writes To |
|---|---|
| **FastAPI** | `claims`, `process_templates`, `attempts`, `memory_states`, `edges`, `clusters`, `cluster_members`, `cluster_lineage`, `sources`, `validations`, `probes`, `misconception_events` |
| **Express** | `learners`, `refresh_tokens`, `notes`, `note_concepts`, `portal_aggregates` |

Neither service writes to the other's tables. This eliminates race conditions.

### Read Access

Both services can **read** all tables. Express reads graph/memory data to serve the learner API. FastAPI reads notes/learner data for ingestion processing.

### Route Ownership

| Path | Service | Access |
|---|---|---|
| `/api/auth/*` | Express | Learner |
| `/api/oauth/*` | Express | Learner |
| `/api/users/*` | Express | Learner |
| `/api/notes/*` | Express | Learner |
| `/api/concepts/*` | Express | Learner (read) |
| `/api/graph/*` | Express | Learner (read) |
| `/api/clusters/*` | Express | Learner (read) |
| `/api/review/*` | Express | Learner (read) |
| `/api/analytics/*` | Express | Learner (read) |
| `/api/learning-paths/*` | Express | Learner (read) |
| `/api/management/*` | Express | Admin (read-only, GET-only) |
| `/ingest/*` | FastAPI | Internal |
| `/retrieval/*` | FastAPI | Internal |
| `/grade/*` | FastAPI | Direct from learner app |
| `/probes/*` | FastAPI | Internal |
| `/health` | FastAPI | Public |

### Direct Grading Path (§12.3)

The learner app POSTs directly to FastAPI `/grade` to minimize latency for embeddings, NLI, and memory updates. Note authoring goes through Express, which enqueues background ingestion jobs.

---

## 9. Deferred Implementation

The following are **intentionally unimplemented** (stubs only):

### Algorithms
- Cosine similarity and claim matching (§5.1–5.2)
- Weighted coverage calculation (§5.3)
- Kendall tau-b ordering (§5.5)
- Precision calculation (§5.4)
- Verbatim penalty with dead zone (§5.6)
- Branch leakage penalty (§5.7)
- Composite score calculation (§5.8)
- NLI contradiction detection (§5.10)
- Perturbation delta scoring (§5.12)
- Adjusted Rand Index for concept sort (§5.13)
- Memory decay R(Δt) = 2^(-Δt/h) (§5.17)
- Half-life update on success/failure (§5.17.3)
- Structural complexity computation (§5.19)
- Curriculum priority scoring (§5.20)
- Louvain community detection (§5.21)
- Jaccard cluster lineage (§5.22)
- Topological sort learning paths (§5.23)
- Structure-mapping alignment (§9.4)

### Integrations
- LLM API calls (classification, extraction, generation)
- Embedding model calls
- NLI model inference
- Web search API
- URL fetching and content extraction
- Source snapshot persistence

### Features
- Complete ingestion pipeline execution
- Process template generation and agreement checking
- Probe synthesis with leakage validation
- Review queue computation with prerequisite detours
- Cluster detection, naming, and lineage tracking
- Learning path generation
- Personal analytics computation
- Portal aggregate computation
- Evaluation harness: seeded corpus, simulated learner, baselines, metrics
- Multilingual grading dispatch (§10.3)
- Analogy node spawning and validation (§9)

---

## 10. Conflicts and Ambiguities

### Resolved

1. **Frontend types vs shared types:** The existing frontend (`KNODES-main/src/types/index.ts`) defines its own `GraphNode`, `GraphEdge`, etc. The new shared types package (`packages/types/src/index.ts`) defines the canonical domain types. Both coexist — the frontend types are UI-specific (include `x`, `y` coordinates, display formatting), while the shared types are domain-canonical. The frontend should eventually import domain types from the shared package and extend them with UI fields.

2. **SERIAL vs UUID for learners.id:** The existing schema used `SERIAL` (integer). The master design uses UUID. The new schema uses UUID throughout. The existing auth routes generate integer IDs — these will need updating when the new schema is applied.

3. **`notes.body` vs `notes.body_md`:** The existing schema/routes use `body`. The master design uses `body_md`. The new schema uses `body_md`. The existing notes routes will need their column references updated.

4. **`notes.concepts` JSONB column:** The existing schema stored extracted concepts as a JSONB array on the notes table. The master design uses a proper `note_concepts` join table with a separate `concepts` table. The JSONB column is removed in the new schema.

### Noted (Not Blocking)

1. **Frontend state management:** KNODES-main uses React Context; the master design doesn't specify state management. No change needed.

2. **Tailwind CSS:** KNODES-main uses Tailwind CSS v4. The master design doesn't explicitly forbid it (only forbids "rich-text editor, plugin system, canvas, sync engine"). Retained as-is. The portal uses vanilla CSS.

3. **pnpm workspaces (D-17):** The master design specifies pnpm workspaces. The current project uses npm. Full workspace conversion is deferred to avoid breaking changes during this structural pass.

4. **Vector dimension (1536):** Set to match OpenAI ada-002. Should be adjusted to match the actual chosen embedding model.

5. **Express TypeScript conversion:** The master design's ideal structure shows `app.ts`. The existing code is JavaScript. TypeScript conversion is deferred as it would touch every existing file.

---

## 11. Implementation Status Summary

| Category | Done | Not Done |
|---|---|---|
| Repository audit | ✅ | |
| Reference document analysis | ✅ | |
| Architecture reconciliation | ✅ | |
| Final project structure | ✅ | |
| Learner app structure | ✅ (existing) | |
| Management portal structure | ✅ (scaffold) | |
| Express backend structure | ✅ | |
| FastAPI backend structure | ✅ | |
| Service boundaries | ✅ (documented) | |
| Database schema | ✅ (19 tables) | |
| Migrations structure | ✅ | |
| API contracts (routes) | ✅ (stubs) | |
| Shared types | ✅ | |
| Class/function definitions | ✅ (stubs) | |
| Route definitions | ✅ (stubs) | |
| Job definitions | ✅ (stubs) | |
| Evaluation structure | ✅ (stubs) | |
| Architecture audit document | ✅ | |
| Business logic | | ❌ Intentionally deferred |
| Algorithm implementation | | ❌ Intentionally deferred |
| LLM integration | | ❌ Intentionally deferred |
| Embedding integration | | ❌ Intentionally deferred |
| Retrieval implementation | | ❌ Intentionally deferred |
| Grading implementation | | ❌ Intentionally deferred |
| Clustering implementation | | ❌ Intentionally deferred |
| Memory calculations | | ❌ Intentionally deferred |
| Probe generation | | ❌ Intentionally deferred |
| Analytics calculations | | ❌ Intentionally deferred |

---

## 12. Build Order Reference (§15)

For subsequent implementation, follow the master design's phased build order:

| Phase | Scope | Depends On |
|---|---|---|
| **0** | ~~Contracts & infrastructure~~ | — (DONE in this pass) |
| **1** | Deterministic grader | Phase 0 |
| **2** | Evaluation harness | Phase 1 |
| **3** | Ingestion & graph | Phase 1 |
| **4** | Templates & probes | Phase 3 |
| **5** | Memory & curriculum | Phase 4 |
| **6** | High-value probes (sort, perturbation, transfer) | Phase 4 |
| **7** | Retrieval & validation | Phase 1 |
| **8** | Clusters & learning paths | Phase 3 |
| **9** | Analytics & portal | Phases 5 + 8 |
| **10** | Analogy tracks, multilingual | Phase 4 |

**Phase 0 is now complete.** The next implementation task should be **Phase 1: The Deterministic Grader**.

---

## 13. Verification Pass (2026-09-26)

The scaffolding was verified against the implementation plan's Verification Plan. All four automated checks pass.

| Check | Command | Result |
|---|---|---|
| Express boots | `node app.js` | ✅ Starts, logs "Server running on port …", no errors |
| Express modules load | require all 23 route/middleware modules | ✅ All OK |
| DB schema valid | parsed with `pglast` (Postgres grammar; no local `psql`) | ✅ `schema.sql` and `001_initial_schema.sql` both parse (50 statements each) |
| FastAPI imports | `pip install -e .` + `from app.main import app` | ✅ Imports (9 routes); all 57 `app.*` submodules import |
| FastAPI tests | `pytest` | ✅ 15 passed |
| Shared types | `tsc --noEmit` | ✅ Clean |
| Portal | `tsc -b` + `vite build` | ✅ Typechecks; builds (58 modules) |

### Fixes applied during verification

These were latent breakages found and corrected — no business logic added:

1. **`routes/management/grader.js`** — contained an invalid escaped-backtick template literal (`\``) that broke parsing, plus a malformed ad-hoc SQL check (`HAVING` without `GROUP BY`). Rewrote to a single clean, privacy-floored (`sample_size >= 5`) read query matching sibling management routes.
2. **`package.json` (Express)** — `axios` was imported by `routes/review.js` and `routes/learning-paths.js` (proxying to FastAPI) but was not declared. Added as a dependency.
3. **`fastapi/pyproject.toml`** — had a trailing literal `\n` causing a `TOMLDecodeError`, blocking install. Removed it and added `[tool.setuptools.packages.find] include = ["app*"]` for reliable package discovery.
4. **`fastapi/pyproject.toml`** — `app/dependencies.py` imports `psycopg_pool`, which ships as the separate `psycopg-pool` distribution. Added `psycopg-pool>=3.2.0` to dependencies.

### Notes

- `node_modules/`, `.venv/`, `__pycache__/`, and build `dist/` outputs are gitignored.
- No source files were deleted; all existing functionality preserved.

---

## 14. Schema Reconciliation to UUID (2026-09-26)

The conflicts noted in §10.2 (SERIAL vs UUID, `notes.body` vs `body_md`, `notes.concepts`) were resolved by a **full UUID reconciliation** applied to the live Neon database.

**Decision (approved):** clear existing users and rebuild, rather than an in-place primary-key type change. There were 5 learners / 38 refresh tokens / 1 note; all were intentionally cleared. Users re-register.

**Migration `003_full_schema_reset.sql`** drops the legacy integer-key `learners`/`notes`/`refresh_tokens` (and their sequences + old enum types), then the runner rebuilds the full 21-table UUID schema from `schema.sql` (19 core tables + `provider_usage` + `ai_cache`). Applied to Neon; verified: `learners.id` is `uuid`, `notes` uses `body_md`/`ingestion_status`, all `learner_id` FKs are UUID.

**Fixes required for Express to work against the new schema:**
1. `refresh_tokens.id` — the schema had `UUID PRIMARY KEY` with **no default**, but Express inserts without supplying `id`. Added `DEFAULT gen_random_uuid()` (and `created_at DEFAULT CURRENT_TIMESTAMP`).
2. `routes/notes.js` — rewritten to the new columns while keeping the **API contract unchanged**: the JSON fields stay `body`/`status`/`concepts`, mapped to `body_md`/`ingestion_status` in SQL; `concepts` returns `[]` until the `note_concepts` join table is populated by ingestion. POST/PUT no longer write `status`/`concepts`.
3. `generateTokens` (in `routes/auth.js` **and** `routes/oauth.js`) — added a random `jti` claim to the refresh token. Without it, a signup and login in the same second produced a byte-identical JWT and violated the `refresh_tokens.token` UNIQUE constraint (a latent bug the reconciliation surfaced). `crypto` now required in both files.

**JWT / OAuth safety:** confirmed UUID-safe. The token payload `id` is opaque (`jwt.sign`/`verify` don't care about its type), `middleware/auth.js` copies the decoded payload verbatim (no `parseInt`), and no code coerces the id to an integer. So UUID string ids flow through auth and notes unchanged.

**Verified end-to-end (real HTTP against Neon):** signup → login → notes POST/GET/PUT/DELETE → bad-token rejection all pass; learner ids are UUIDs; note body round-trips through `body_md`. Test users were removed afterward (Neon back to 0 learners).

**Still deferred:** the `learners`/`notes` etc. remain unpopulated by the ingestion pipeline (concepts/claims/edges are created by FastAPI, not yet run end-to-end). The API's `concepts: []` placeholder stands until ingestion writes to `note_concepts`.
