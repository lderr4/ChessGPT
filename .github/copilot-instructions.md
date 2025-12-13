Repository: ChessGPT — Copilot / AI agent guidance

Purpose

- Short, actionable guidance to help an AI coding agent be productive in this repo.

Big picture

- Backend: `backend/` — FastAPI app (`backend/app`) using SQLAlchemy + Alembic. Entry: `backend/app/main.py`.
- Frontend: `frontend/` — React + TypeScript + Vite. API client in `frontend/src/lib/api.ts`.
- Orchestration: `docker-compose.yml` brings up Postgres, Redis, backend, frontend. Use Docker Compose for local dev.

Key files to read first

- `backend/app/main.py` — app creation, CORS, router mounting (`/api` prefix).
- `backend/app/config.py` — all runtime settings via Pydantic `Settings`; change via `.env` or Docker env.
- `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/database.py` — DB surface and types.
- `backend/app/routers/*.py` and `backend/app/services/*.py` — API surface vs business logic split.
- `docker-compose.yml` — how services talk (note `host.docker.internal` mapping for Ollama).
- `frontend/src/lib/api.ts`, `frontend/src/store/authStore.ts` — how auth tokens and API URLs are managed.

Developer workflows (concrete commands)

- Start full stack (recommended):
  - `docker compose up -d` (or `docker-compose up -d` on older systems)
  - Inspect logs: `docker compose logs -f`
- Backend local dev without Docker:
  - `cd backend && pip install -r requirements.txt`
  - Copy `.env.example` -> `.env` and edit (or use values from `backend/README.md`).
  - Run migrations: `alembic upgrade head` (run from `backend/`).
  - Start server: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
- Frontend dev:
  - `cd frontend && npm install && npm run dev` (set `VITE_API_URL` in `.env`).
- Utility targets from repo:
  - `make restart` runs `docker compose down && docker compose build && docker compose up -d`.
  - `make reset-analysis-job` queries analysis jobs via `docker compose exec psql` (see `Makefile`).

Patterns & conventions (repo-specific)

- Router/Service separation: route handlers in `backend/app/routers/*.py` delegate heavy logic to `backend/app/services/*.py`.
- Models/Schemas: DB models in `models.py`, Pydantic request/response shapes in `schemas.py` — keep them in sync; migrations must reflect model changes.
- Config via `pydantic_settings.Settings` in `backend/app/config.py`: prefer adding new config values here; `.env` is source of truth in dev.
- Background jobs: imports/analysis happen asynchronously in `services/analysis_service.py` — don't perform heavy sync work in routers.
- Feature flags: simple booleans in config (e.g., `ENABLE_COACH`) control optional AI integrations.

Integration points to be careful with

- Chess.com: `backend/app/services/chess_com_service.py` (imports) — respect `CHESS_COM_USER_AGENT` and API rate limits.
- Stockfish: set `STOCKFISH_PATH` in env; container uses system-installed engine. For Windows dev, download binary and set path in `.env`.
- AI Coach: `COACH_PROVIDER` toggles `ollama` vs `openai`. Docker compose exposes Ollama via `host.docker.internal:11434`.
- Redis: used for background/queue state — `REDIS_URL` set in config and compose.

Tests & quality

- Backend tests: run `cd backend && pytest`.
- Frontend tests: `cd frontend && npm test`.
- Backend lint/format: `cd backend && black . && flake8 .`.

When making changes

- API change flow: update `schemas.py` → update `routers/*.py` (validate inputs) → implement business logic in `services/*.py` → update `models.py` if DB changes → create Alembic migration (`alembic revision --autogenerate -m "msg"`) → `alembic upgrade head`.
- Frontend change flow: update `src/pages`/`src/components` and `src/lib/api.ts` for any API contract changes; update `frontend/package.json` scripts if needed.

Examples in repo

- Example router: `backend/app/routers/games.py` (routes for import, analyze, list games).
- Example service: `backend/app/services/analysis_service.py` (analysis job orchestration and Stockfish calls).

Notes & gotchas

- `Base.metadata.create_all(bind=engine)` is called at import-time in `main.py`; migrations are still used — prefer Alembic for schema changes.
- CORS origins default include `http://localhost:5173` and `3000` in `config.py`.
- When running in Docker, `OLLAMA_BASE_URL` uses `host.docker.internal`; locally you may need to match that pattern on Windows.

If anything above is missing or you'd like me to expand examples (e.g., show a guided PR template or add quick-fix rules), tell me what to include and I'll iterate.
