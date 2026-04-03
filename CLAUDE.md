# ChessGPT — CLAUDE.md

Chess analytics platform. Imports games from Chess.com and Lichess, runs Stockfish analysis asynchronously via Celery workers, and serves a React frontend with real-time updates over SSE.

---

## Architecture

```
frontend (React/Vite :5173)
    ↓ HTTP + SSE
api (FastAPI :8000)
    ↓ Celery tasks via Redis
stockfish_worker (4 concurrent)   ← CPU-bound analysis
import_worker    (1 concurrent)   ← I/O-bound Chess.com/Lichess API calls
    ↓
postgres (SQLAlchemy ORM)
redis (broker + pub/sub for SSE)
```

All services share the same backend Docker image but run different commands.

---

## Running the Project

```bash
# Start everything (preferred)
docker compose up -d

# Full rebuild
make restart

# Access
# Frontend:  http://localhost:5173
# API docs:  http://localhost:8000/docs
```

Services: `postgres` (5432), `redis` (6379), `api` (8000), `stockfish_worker`, `import_worker`, `frontend` (5173).

---

## Key Makefile Commands

```bash
make restart                # docker compose down + build + up -d
make run-validation-tests   # pytest test_analysis_service_validation.py
make run-performance-tests  # Stockfish benchmark
make clear-analyses         # Wipe all analysis data
make clear-user-games       # Delete games for user lderr4
```

---

## Tech Stack

**Backend:** FastAPI, SQLAlchemy 2.0, PostgreSQL 15, Alembic, Celery 5, Redis 7, python-chess, Stockfish, python-jose (JWT), bcrypt, sse-starlette

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router v6, react-chessboard, chess.js, Recharts, Axios

**Infra:** Docker Compose, two Celery queues (`celery` for analysis, `imports` for import tasks)

---

## Backend Structure

```
backend/app/
  main.py              # FastAPI app init, CORS, router registration
  config.py            # Settings from .env (Pydantic BaseSettings)
  database.py          # SQLAlchemy engine + session
  models.py            # ORM models
  schemas.py           # Pydantic request/response schemas
  auth.py              # JWT + bcrypt
  routers/             # auth, games, stats, puzzles
  services/
    analysis_service.py      # Stockfish integration (async)
    chess_com_service.py     # Chess.com API
    lichess_service.py       # Lichess API
    stats_service.py         # Aggregation logic
    coach_service.py         # OpenAI / Ollama coaching (optional)
    puzzle_service.py        # Puzzle extraction from analyzed games
    redis_pubsub.py          # SSE real-time events
  worker/
    celery_app.py            # Celery config + task routing
    tasks.py                 # Import and analysis tasks
backend/alembic/             # Migrations
backend/tests/               # pytest suite
backend/scripts/             # Utility scripts (clear_analyses, delete_user_games)
```

---

## Frontend Structure

```
frontend/src/
  pages/
    Dashboard.tsx       # Performance overview
    Games.tsx           # Game list with SSE real-time updates
    GameViewer.tsx      # Move-by-move analysis with board
    Statistics.tsx      # Charts and analytics
    Openings.tsx        # ECO opening repertoire
    Puzzles.tsx         # Tactics from user's own games
    Profile.tsx         # Import settings
  components/           # Reusable UI
  store/                # Zustand stores
  lib/api.ts            # Axios client with JWT interceptors
```

---

## Database Schema

- `users` — accounts, ratings, import timestamps
- `games` — Chess.com + Lichess games with analysis metadata
- `moves` — per-move Stockfish evaluations and move classifications
- `openings` — ECO reference
- `user_stats` — aggregated accuracy, errors, win/loss
- `import_jobs` — async import job status
- `analysis_jobs` — async analysis job status
- `puzzle_analysis_cache` — deep analysis results for puzzle mode

Migrations managed via Alembic (`backend/alembic/`).

---

## Environment Variables

The API container reads from `.env` in `backend/`. Key variables:

```env
DATABASE_URL=postgresql://chess_user:chess_password@postgres:5432/chess_analytics
SECRET_KEY=<change in production>
REDIS_URL=redis://redis:6379/0
STOCKFISH_PATH=/usr/games/stockfish   # Docker path; local install will differ
STOCKFISH_DEPTH=20
STOCKFISH_TIME_LIMIT=1.0
PUZZLE_ANALYSIS_DEPTH=22
PUZZLE_ANALYSIS_TIME=3.0
ENABLE_COACH=false
COACH_PROVIDER=ollama                 # or "openai"
OPENAI_API_KEY=                       # if using OpenAI
OLLAMA_BASE_URL=http://localhost:11434
CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]
```

Frontend reads `VITE_API_URL=http://localhost:8000` (set in docker-compose).

There is no `.env.example` — reference `backend/app/config.py` for all settings and defaults.

---

## Move Classification Logic

Stockfish centipawn loss thresholds (in `analysis_service.py`):
- **best / excellent / good** — small or no loss
- **inaccuracy** — 50–150 CP loss
- **mistake** — 150–300 CP loss
- **blunder** — 300+ CP loss OR position swing (winning → losing)

---

## Real-time Updates (SSE)

1. Celery analysis task completes → publishes to Redis Pub/Sub channel
2. API `/api/games/events/analysis` endpoint subscribes and streams events
3. Frontend `EventSource` listener updates UI live (no polling needed)

---

## Testing

```bash
# Inside the API container
docker compose exec chess_analytics_api pytest tests/ -v

# Or via Makefile
make run-validation-tests
```

Test files: `tests/test_analysis_service_validation.py`, `test_analysis_service_performance.py`, `test_chess_com_service.py`, `test_coach_service.py`, `test_stats_service.py`.

---

## Celery Task Routing

| Queue     | Worker          | Concurrency | Purpose                        |
|-----------|-----------------|-------------|--------------------------------|
| `celery`  | stockfish_worker| 4           | Game analysis (CPU-bound)      |
| `imports` | import_worker   | 1           | Chess.com/Lichess import (rate-limited) |

---

## Container Names

- `chess_analytics_db` — Postgres
- `chess_analytics_redis` — Redis
- `chess_analytics_api` — FastAPI
- `chess_analytics_frontend` — React dev server
- stockfish/import workers have no static name (to allow scaling)

---

## Common Gotchas

- **Stockfish path differs locally vs Docker.** In Docker it's `/usr/games/stockfish`; adjust `STOCKFISH_PATH` for local dev.
- **File watching on Windows.** `WATCHFILES_FORCE_POLLING=true` and `CHOKIDAR_USEPOLLING=true` are set in docker-compose for hot reload on Windows.
- **Import deduplication.** Importing the same user twice is safe — games are deduplicated by `chess_com_id` / `lichess_id`. A 409 is returned if an import job is already pending/processing.
- **No `.env.example`.** Check `backend/app/config.py` for all configurable settings.
- **AI Coach is disabled by default.** Set `ENABLE_COACH=true` and configure `COACH_PROVIDER` to enable it.

