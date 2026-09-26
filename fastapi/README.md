# Kaizou FastAPI Backend

Computational/ML services: ingestion, grading, memory, graph, probes, retrieval, evaluation, and jobs. It is the only service that holds AI provider keys.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env   # then fill in the keys
```

## AI providers

| Role | Provider / model | Key |
|---|---|---|
| Classification | Jev `typesafe/jev-1.13` (via OpenRouter) | `OPENROUTER_API_KEY` |
| Generation | Claude Opus 5.5 `claude-opus-5-5` | `ANTHROPIC_API_KEY` |
| Embeddings | `gemini-embedding-2` @ 1536 dims | `GEMINI_API_KEY` |

The code lives in `app/providers/`. See `../AI_PROVIDER_DECISIONS.md` for the reasoning and for where to get each key.

## Verify your setup

Run from this folder once `.env` has keys:

```powershell
.\.venv\Scripts\python.exe -m app.providers.health
```

Each provider gets one small real call (well under one US cent each). Expected output:

```
[PASS] classification jev/openrouter   typesafe/jev-1.13 ...
[PASS] generation     anthropic        claude-opus-5-5 ...
[PASS] embeddings     gemini           gemini-embedding-2 ...
```

To check a single role, pass it by name: `classification`, `generation`, or `embeddings`. To check the benchmarking generator, run `generation --provider gemini`. The exit code is 0 only when every check passes. A missing or rejected key prints the env var to fix and where to get it, with no stack trace.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```
