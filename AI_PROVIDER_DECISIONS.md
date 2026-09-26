# AI Provider Decisions

**Date:** 2026-09-26
**Scope:** The AI integration layer only. Domain logic (grading, coverage, clustering, decay) is unchanged.
**Code:** `fastapi/app/providers/`

## Summary

| Role | Choice | Model ID | Key | Endpoint |
|---|---|---|---|---|
| Classification | Jev (TypeSafe AI) | `typesafe/jev-1.13` | `OPENROUTER_API_KEY` | `POST openrouter.ai/api/alpha/decisions` |
| Generation (primary) | Claude Opus 5.5 (Anthropic) | `claude-opus-5-5` | `ANTHROPIC_API_KEY` | `POST api.anthropic.com/v1/messages` |
| Generation (secondary, benchmarking only) | Gemini 3.8 Flash | `gemini-3.8-flash` | `GEMINI_API_KEY` (shared) | `POST …/v1beta/interactions` |
| Embeddings | Gemini Embedding 2 | `gemini-embedding-2` @ 1536 dims | `GEMINI_API_KEY` | `POST …/models/gemini-embedding-2:batchEmbedContents` |
| Contradiction (NLI) | unchanged, local | `cross-encoder/nli-deberta-v3-base` | none | runs in-process |

You need three keys: OpenRouter, Anthropic, and Google AI Studio. One Google key covers both embeddings and the optional secondary generator, so there is no duplicate entry for it. Every key lives only in `fastapi/.env`. Express and both frontends never see them.

## 1. Primary generative model: Claude Opus 5.5

**Choice:** `claude-opus-5-5`, released 2026-09-22. It uses structured outputs (`output_config.format` of type `json_schema`) with effort `medium`.

How it scores against the priorities in the brief:

1. **Reliability and low hallucination.** This model writes the ground truth that deterministic grading depends on: claims, templates, and deltas. Anthropic currently recommends Opus 5.5 as the default for most workloads ([models overview](https://docs.anthropic.com/en/docs/about-claude/models/overview)). Adaptive thinking is always on, and depth is tunable through `effort`. Anthropic markets the model on honesty, but I could not find an independent hallucination benchmark for a model this new. The design's own harness (§14) is where to measure it, and that is why a secondary generator exists.
2. **Native structured output.** Anthropic structured outputs use constrained decoding against the JSON Schema. Output always parses and required fields are always present ([structured outputs docs](https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs)). This replaces the old approach of asking for JSON and hoping. Two edge cases the client handles:
   - `stop_reason: "refusal"` → `ProviderRefusalError`
   - `stop_reason: "max_tokens"` (truncated JSON) → `ProviderResponseError`
3. **Context window.** 1M input tokens and 128K output. A note plus its retrieved source snapshot fits with a wide margin.
4. **Cost (tiebreaker).** $4 / $20 per million input/output tokens. Sonnet 5 costs $2 / $10, half as much.

**Cost at project scale.** A few hundred concepts leads to a few thousand generation calls: extraction, prerequisites, two template runs per concept, and probes with leakage retries. At a guess of ~2k input and ~2k output tokens per call (thinking included), 7,500 calls come to about $60 input + $300 output. That is an order-of-magnitude estimate, not a measurement. There are two knobs if the budget matters:
- `GENERATION_EFFORT=low` cuts thinking tokens.
- `GENERATION_MODEL=claude-sonnet-5` halves the price. This is a config-only change, but re-run the health check after switching.

**Consequences in code:**
- Opus 5.5 rejects `temperature`, `top_p`, and `top_k`. It also rejects both `thinking: disabled` and manual thinking budgets ([migration guide](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide)). The old `temperature` settings at the call sites (0.0, 0.3, 0.7) were therefore removed.
- The two independent template generations (T1 "generate twice, agree, cache") still sample independently at default settings, which is what the agreement check needs.
- Responses start with thinking blocks. The client selects the text block by type, never by position.

**Secondary generator (benchmark flag).** `GENERATION_PROVIDER=gemini` routes every generation call site to Gemini 3.8 Flash through the same `GenerationClient` interface. It is off by default. It is a different model family, which makes generator comparisons in the evaluation chapter meaningful, and it reuses the Google key. The system prompt is prepended to `input`, because I could not confirm a separate system-instruction field for the current Interactions API revision.

## 2. Embedding model: Gemini Embedding 2 at 1536 dimensions

**Choice:** `gemini-embedding-2` (stable, last updated April 2026) with `output_dimensionality=1536`.

Why it fits what this project actually matches on:

- **Cross-lingual matching is a hard requirement.** D-11 and D-12 store claims once, in the source language, and hand cross-lingual matching to the embedding model (§10.2). Gemini Embedding 2 covers 100+ languages in one space ([embeddings docs](https://ai.google.dev/gemini-api/docs/embeddings)). This single requirement rules out English-only models such as `paraphrase-MiniLM-L6-v2`.
- **Short, symmetric, sentence-level inputs.** Claims, labels, and probes are one-sentence texts compared against each other. The model supports a symmetric `task: sentence similarity` format intended for exactly this kind of semantic textual similarity.
- **No schema change.** 1536 is one of Google's recommended MRL sizes. It matches the existing `vector(1536)` columns (`concepts.label_embedding`, `claims.embedding`). Google's MRL table for the previous model shows no loss at this size (MTEB 68.17 at 1536 vs 68.16 at 2048). I did not find equivalent published figures for `-2`.
- **Exact k-NN stays cheap.** The corpus is a few thousand vectors, so exact cosine search at 1536 dims costs nothing. The 🔒 no-HNSW/IVFFlat rule is untouched and no index was added.
- **Why not `gemini-embedding-001`:** it is also stable, but older (June 2025). Its input limit is 2,048 tokens versus 8,192. Stored vectors are pinned to one model, and switching later means re-embedding everything, so the model with the longer support horizon is the safer choice.
- **Why not OpenAI `text-embedding-3-*`:** it would add a fourth key, and third-party trackers now place Gemini's embeddings above it on multilingual and general MTEB.

**Rules the client enforces:**
- One request per text. Several parts in one content object would give a single aggregated vector.
- Every stored vector uses the same `sentence similarity` prefix, so all pgvector columns stay comparable. The other `EmbeddingTask` values exist for experiments only.
- Vectors are L2-normalised, and the dimension is checked against `EMBEDDING_DIMENSIONS`. A mismatch raises an error that points at `schema.sql`.
- Calls are batched, up to 100 texts per `batchEmbedContents` call.

**Correction to the previous pass.** `text-embedding-004`, the old default, no longer appears in Google's current embeddings documentation. Its vectors are also incompatible with Gemini Embedding 2. No embeddings have been stored yet, so nothing needs migrating.

## 3. Jev for classification

Jev is wired and is now the only transport for `ingestion/classifier.py`. One request asks four independent questions in parallel:

| Question | Jev primitive | Maps to |
|---|---|---|
| `track` | Choice (3 labels) | `concepts.track` |
| `shape` | Choice (4 labels) | `concepts.shape` |
| `category` | Choice (5 labels) | `concepts.category` |
| `bloom_level` | Score (4 ordered levels) | level index → 0.5 / 1.0 / 1.5 / 2.0 → `c_bloom` |

The label descriptions are the ones the classifier already had in its old JSON prompt, carried over word for word. Confidence-based escalation (for example, routing to a human or the LLM when `confidence` is low) is domain logic and is deliberately left out of this pass. The typed `confidence` and `probabilities` values are available on the `Decision` object for when it is added.

**Backend.** OpenRouter is the default. It needs no separate TypeSafe account, has no waitlist ([OpenRouter Jev hub](https://openrouter.ai/docs/guides/community/jev)), and allows pinning to `typesafe/jev-1.13` so tuned thresholds stay stable. `JEV_BACKEND=typesafe` switches to TypeSafe's native `api.typesafe.ai/v1/systemone`, which uses the same wire format.

**Guardrail.** Jev only ever sees note content. Pointing it at a learner's answer to decide a grade would be model judgment, which §2.4 forbids. The module docstrings say so.

**Why C2 and C5 moved from GEN to Jev.** The master design marks both as GEN, but their output is "pick one of N" or "place on a scale". That is exactly Jev's contract, and section 2 of the provider brief locks this routing. The 🔒 "LLM output is a structured object" principle still holds, and more strictly: Jev cannot produce free text at all.

## 4. Call-site map

**Classification-shaped (Jev):**

| Feature | Location | Status |
|---|---|---|
| C2 Track, shape, and category | `ingestion/classifier.py` | wired |
| C5 Bloom complexity prior | `ingestion/classifier.py` | wired |

**Generation-shaped (primary LLM):**

| Feature | Location | Status |
|---|---|---|
| C3 Claim extraction | `ingestion/extractor.py` → `extract_claims` | wired (existing prompt + new schema) |
| C4 Prerequisite labels | `ingestion/extractor.py` → `extract_prerequisites` | wired; also fixed a `str.format` crash on the literal JSON braces in its prompt |
| S4 Source claim extraction | `retrieval/router.py` (reuses `extract_claims`) | wired |
| T1/T2 Template trunk and branches | `probes/templates.py` | wired. `branches` goes over the wire as a list because strict schemas cannot express dynamic keys, then converts back to the stored dict |
| T4 Probe synthesis | `probes/generation.py` | wired |
| S1 Search-query formulation | not yet present; `retrieval/search.py` searches the raw label | stub, use `get_generation_client()` |
| T3 Perturbation deltas | not yet present (`deltas` is stored as `{}`) | stub |
| F5 Cluster naming | not yet present in `graph/clustering.py` | stub |
| §9 Analogy correspondence extraction | not yet present | stub |

**Embeddings:** C6 identity, C7 storage, G2 semantic edges, T5 leakage, grading claim matching, and S5 source coverage. All of them go through `ingestion/embedding.py` → `EmbeddingService`, whose interface is unchanged.

**No provider:** S6 contradiction (local NLI), and all deterministic grading, graph, memory, and analytics code.

"Wired" here means only the transport changed. Prompts, parsing, and downstream logic are what the previous pass wrote. The only additions are the JSON Schemas that structured outputs require.

## 5. Obtaining keys

| Key | Where | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | Add credits to the account. Jev is billed per input token; output is free. |
| `TYPESAFE_API_KEY` (optional) | console.typesafe.ai → Settings → Keys | Only for `JEV_BACKEND=typesafe`. Community write-ups from mid-September described early access as waitlisted, while another said the hosted API was public from 2026-09-21. Unconfirmed; OpenRouter avoids the question. |
| `ANTHROPIC_API_KEY` | Claude Console → Settings → API keys (platform.claude.com) | Add a payment method or credits first. Anthropic's docs moved to platform.claude.com; confirm the console URL when you sign up. |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | See the privacy note below. |

**Privacy note (Google).** Google's pricing page marks free-tier usage as "used to improve our products". Learner notes are personal data (D-09 and D-10 treat them as private). Enable billing on the Google Cloud project behind the key so traffic runs on the paid tier before real users' notes are embedded. At about $0.20 per million tokens, the whole corpus costs cents.

## 6. What I did not follow from the earlier research

`Choose-Neon-Plan.md` is **not in the repository**. `_references/` has no file by that name. The closest earlier research is the chat log in `_references/fppp.txt`, which I used as background. From it, I deliberately did not follow:

| Suggestion in fppp.txt | Why not |
|---|---|
| Reuse local `paraphrase-MiniLM-L6-v2` via sentence-transformers | English-only, which fails D-12 cross-lingual matching. 384 dims would also mean changing the schema. |
| FAISS for similarity | Unnecessary. pgvector exact k-NN is locked (§2.4), and FAISS would add a second vector store. |
| Redis + Celery for LLM calls | Already superseded by D-13 (DB-backed jobs). No change here. |

If `Choose-Neon-Plan.md` exists elsewhere, check it against this document. Nothing here depends on the Neon plan tier, because every provider call is outbound HTTP from FastAPI.

## 7. Claims to re-verify before shipping

Everything below was checked on 2026-09-26 and can drift:

- **Opus 5.5 is 4 days old.** Its request constraints (no sampling params, adaptive-only thinking, `effort` inside `output_config`) come from the migration guide. The health check exercises this exact request shape, so a pass confirms it.
- **Pricing:**
  - Anthropic: Opus 5.5 $4/$20, Sonnet 5 $2/$10 (official overview).
  - Jev: $0.042 per million input tokens, output free. This comes from OpenRouter-linked community sources and I did not read it on the model page itself. Every Jev response includes `usage.cost`, and the health check prints it.
  - Gemini Embedding 2: $0.20 per million text tokens on the paid tier (official pricing page).
- **Native TypeSafe details:** the pinned native model ID (the default here is the `jev-latest` alias, marked `TODO(verify)` in code) and whether signup is waitlisted.
- **Gemini Interactions API** (secondary generator only): it is `v1beta` and had breaking changes in May 2026. The request and response shapes follow the post-June "steps" schema.
- **`sentence similarity` prefix wording** for gemini-embedding-2 is taken from Google's task table. If Google changes it, every stored vector would need re-embedding. Pin it and treat a change as a migration.
- **`claude-sonnet-5` support for `effort`** is untested. Run the health check after switching.

## 8. Verify your setup

```powershell
cd second_brain-main\fastapi
Copy-Item .env.example .env    # then fill in the three keys
.\.venv\Scripts\python.exe -m app.providers.health
```

Each provider gets one small real call:
- **Jev:** a single Noul question.
- **Claude:** a tiny structured answer at `effort=low`.
- **Gemini:** two sentences, English and Spanish. It prints the dimension count and the cross-lingual cosine similarity.

The exit code is 0 only if all three pass. Pass a role name (`classification`, `generation`, `embeddings`) to check one role, or run `generation --provider gemini` to check the benchmark generator. A missing key prints the exact env var and where to get it, with no stack trace.

The health check is deliberately not exposed as an HTTP route. An unauthenticated endpoint that triggers paid calls would be a cost and abuse risk.

At runtime, provider failures inside FastAPI routes return JSON with `error: "ai_provider_error"`: HTTP 503 for missing configuration, 502 for upstream failures. The message names env vars but never includes their values.
