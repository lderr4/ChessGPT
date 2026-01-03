# Chess Analytics Platform

A comprehensive web application for analyzing chess games, tracking performance, and studying openings. Import your games from Chess.com, get detailed Stockfish analysis, and visualize your chess journey with beautiful statistics and insights.

## Features

### For Players

- **Game Import**: Automatically import all your games from Chess.com
- **Engine Analysis**: Deep analysis with Stockfish engine
  - Move-by-move evaluation
  - Classification (best, good, inaccuracy, mistake, blunder)
  - Centipawn loss calculation
  - Accuracy scoring
- **Interactive Game Viewer**: Replay games with analysis annotations
- **Opening Repertoire**: Track performance by opening (ECO codes)
- **Advanced Statistics**:
  - Win/loss/draw breakdown
  - Performance by color (white vs black)
  - Time control statistics
  - Performance trends over time
  - Error analysis (blunders, mistakes, inaccuracies)
- **Beautiful Visualizations**: Charts and graphs for all your data

### Technical Features

- **Multi-user Support**: Full authentication system with JWT
- **Scalable Backend**: FastAPI with PostgreSQL and Redis
- **Distributed Task Queue**: Celery workers for parallel processing
- **Real-time Updates**: Server-Sent Events (SSE) for live analysis notifications
- **Rate Limiting**: Serialized Chess.com API calls to prevent rate limit issues
- **Modern Frontend**: React with TypeScript and Tailwind CSS
- **Responsive Design**: Works on desktop and mobile

## Tech Stack

### Backend

- **FastAPI**: Modern Python web framework
- **PostgreSQL**: Robust relational database
- **Redis**: Message broker for Celery and pub/sub for real-time events
- **Celery**: Distributed task queue for background processing
- **SQLAlchemy**: ORM for database operations
- **python-chess**: Chess library for game parsing
- **Stockfish**: World-class chess engine
- **JWT**: Secure authentication
- **Alembic**: Database migrations
- **SSE (Server-Sent Events)**: Real-time event streaming to frontend

### Frontend

- **React 18**: UI library
- **TypeScript**: Type safety
- **Vite**: Fast build tool
- **Tailwind CSS**: Utility-first CSS
- **Recharts**: Data visualization
- **react-chessboard**: Interactive chess board
- **Zustand**: State management
- **React Router**: Client-side routing

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### Running with Docker (Recommended)

1. **Clone the repository**

```bash
git clone <repository-url>
cd chess
```

2. **Create environment file**

```bash
# Backend .env file
cd backend
cp .env.example .env
# Edit .env and set your SECRET_KEY and other configurations
```

3. **Start all services**

```bash
cd ..
docker-compose up -d
```

This will start:

- **PostgreSQL** database (port 5432)
- **Redis** message broker (port 6379)
- **API** service - FastAPI server (port 8000)
- **Stockfish Worker** - Celery worker for game analysis (4 concurrent workers)
- **Import Worker** - Celery worker for Chess.com imports (1 worker, rate limited)
- **Frontend** - React development server (port 5173)

4. **Access the application**

- Frontend: http://localhost:5173
- API Docs: http://localhost:8000/docs
- API: http://localhost:8000

### Manual Setup

#### Backend Setup

1. **Install dependencies**

```bash
cd backend
pip install -r requirements.txt
```

2. **Set up PostgreSQL**

```bash
# Create database
psql -U postgres
CREATE DATABASE chess_analytics;
CREATE USER chess_user WITH PASSWORD 'chess_password';
GRANT ALL PRIVILEGES ON DATABASE chess_analytics TO chess_user;
\q
```

3. **Install Stockfish**

```bash
# Ubuntu/Debian
sudo apt-get install stockfish

# macOS
brew install stockfish

# Windows: Download from https://stockfishchess.org/download/
```

4. **Configure environment**

```bash
cp .env.example .env
# Edit .env with your settings
```

5. **Run migrations**

```bash
alembic upgrade head
```

6. **Start the server**

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup

1. **Install dependencies**

```bash
cd frontend
npm install
```

2. **Configure environment**

```bash
# Create .env file
echo "VITE_API_URL=http://localhost:8000" > .env
```

3. **Start development server**

```bash
npm run dev
```

## Usage

### 1. Register an Account

- Go to http://localhost:5173
- Click "Sign up" and create an account
- Optionally add your Chess.com username during registration

### 2. Import Games

- Navigate to Profile
- Enter your Chess.com username (if not already set)
- Click "Import Games from Chess.com"
- Wait for the import to complete (this may take a few minutes)

### 3. Analyze Games

- Click "Analyze" on any game to queue it for analysis
- Or use "Analyze All Games" for batch processing
- Analysis runs in parallel using Celery workers with Stockfish
- Real-time updates via SSE - games update automatically when analysis completes
- No need to refresh the page!

### 4. Explore Your Data

- **Dashboard**: Overview of your performance
- **Games**: Browse all your games, filter by opening/time control/result
- **Game Viewer**: Click any game to see detailed analysis
- **Statistics**: Deep dive into your performance metrics
- **Openings**: Discover which openings work best for you

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Games

- `GET /api/games/` - List games (with filters)
- `GET /api/games/{id}` - Get game details
- `POST /api/games/import` - Import games from Chess.com (queued, rate limited)
- `GET /api/games/import/status/{job_id}` - Get import job status
- `POST /api/games/{id}/analyze` - Analyze a game (queued to Celery)
- `POST /api/games/analyze/all` - Batch analyze all unanalyzed games
- `GET /api/games/analyze/status/{job_id}` - Get batch analysis job status
- `GET /api/games/events/analysis` - SSE endpoint for real-time analysis updates
- `DELETE /api/games/{id}` - Delete a game

### Statistics

- `GET /api/stats/` - Get user statistics
- `GET /api/stats/openings` - Get opening statistics
- `GET /api/stats/time-controls` - Get time control stats
- `GET /api/stats/performance-over-time` - Get trends
- `GET /api/stats/dashboard` - Get dashboard data

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Dashboard │  │  Games   │  │  Stats   │  │ Profile  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │              │
│       └─────────────┴─────────────┴─────────────┘              │
│                          │                                      │
│                    HTTP/REST API                                │
│                    SSE (Real-time)                             │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI (API Service)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Auth       │  │    Games     │  │    Stats        │   │
│  │   Router     │  │    Router    │  │    Router       │   │
│  └──────────────┘  └──────┬───────┘  └──────────────┘   │   │
│                           │                               │   │
│                    ┌──────▼──────┐                        │   │
│                    │  Services   │                        │   │
│                    │  - Analysis │                        │   │
│                    │  - Chess.com│                        │   │
│                    │  - Stats    │                        │   │
│                    │  - Redis    │                        │   │
│                    └──────┬──────┘                        │   │
└──────────────────────────┼────────────────────────────────┘   │
                           │                                      │
        ┌──────────────────┼──────────────────┐                  │
        │                  │                  │                  │
        ▼                  ▼                  ▼                  │
┌──────────────┐   ┌──────────────┐   ┌──────────────┐          │
│  PostgreSQL  │   │    Redis     │   │  Celery      │          │
│  Database    │   │  Message     │   │  Task Queue  │          │
│              │   │  Broker      │   │              │          │
│  - Users     │   │  - Queue     │   │  - Analysis  │          │
│  - Games     │   │  - Pub/Sub   │   │  - Imports  │          │
│  - Moves     │   │              │   │              │          │
│  - Stats     │   │              │   │              │          │
└──────────────┘   └──────┬───────┘   └──────┬───────┘          │
                          │                  │                  │
                          │                  │                  │
        ┌─────────────────┴──────────────────┴────────┐         │
        │                                              │         │
        ▼                                              ▼         │
┌──────────────────┐                        ┌──────────────────┐│
│ Stockfish Worker │                        │  Import Worker   ││
│ (Celery)         │                        │  (Celery)        ││
│                  │                        │                  ││
│ - 4 concurrent   │                        │ - 1 worker      ││
│   workers        │                        │ - Rate limited   ││
│                  │                        │                  ││
│ Processes:       │                        │ Processes:       ││
│ - Game analysis  │                        │ - Chess.com API  ││
│ - Stockfish      │                        │   calls          ││
│   evaluation     │                        │ - Game import    ││
│ - Move analysis  │                        │                  ││
└──────────────────┘                        └──────────────────┘│
        │                                              │         │
        │         ┌─────────────────────┐              │         │
        │         │   Chess.com API     │              │         │
        │         │   (External)        │              │         │
        │         └─────────────────────┘              │         │
        │                                              │         │
        └──────────────────────────────────────────────┘         │
                                                                  │
┌──────────────────────────────────────────────────────────────┐│
│              Real-time Event Flow (SSE)                      ││
│                                                              ││
│  Stockfish Worker → Redis Pub/Sub → API SSE Endpoint       ││
│                      → Frontend EventSource                 ││
│                      → UI Updates                            ││
└──────────────────────────────────────────────────────────────┘│
```

### Component Responsibilities

**Frontend (React)**

- User interface and interactions
- Real-time updates via SSE
- State management with Zustand
- Data visualization with Recharts

**API Service (FastAPI)**

- HTTP request handling
- Authentication and authorization
- Business logic orchestration
- SSE endpoint for real-time events
- Task queueing (Celery dispatch)

**PostgreSQL Database**

- Persistent data storage
- User accounts, games, moves, statistics
- ACID transactions

**Redis**

- Celery message broker (task queue)
- Pub/Sub for real-time events
- Fast in-memory operations

**Stockfish Worker (Celery)**

- Parallel game analysis (4 workers)
- Stockfish engine integration
- Move-by-move evaluation
- Publishes completion events to Redis

**Import Worker (Celery)**

- Serialized Chess.com API calls (1 worker)
- Rate limiting (prevents API throttling)
- Game import and parsing
- Idempotency checks

## Project Structure

```
ChessGPT/
├── backend/
│   ├── app/
│   │   ├── routers/           # API endpoints
│   │   │   ├── auth.py       # Authentication routes
│   │   │   ├── games.py      # Game management & SSE
│   │   │   └── stats.py      # Statistics endpoints
│   │   ├── services/         # Business logic
│   │   │   ├── analysis_service.py    # Stockfish analysis
│   │   │   ├── chess_com_service.py   # Chess.com API
│   │   │   ├── stats_service.py       # Statistics calculation
│   │   │   ├── redis_pubsub.py        # Redis pub/sub
│   │   │   └── coach_service.py       # AI coach (optional)
│   │   ├── worker/            # Celery workers
│   │   │   ├── celery_app.py # Celery configuration
│   │   │   └── tasks.py      # Celery tasks (analysis, import)
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── schemas.py        # Pydantic schemas
│   │   ├── auth.py           # JWT authentication
│   │   ├── config.py         # Configuration
│   │   ├── database.py       # Database connection
│   │   ├── logging_config.py # Logging setup
│   │   └── main.py           # FastAPI app
│   ├── scripts/              # Utility scripts
│   │   ├── clear_analyses.py # Clear analysis data
│   │   └── delete_user_games.py # Delete user games
│   ├── alembic/              # Database migrations
│   ├── requirements.txt      # Python dependencies
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── pages/            # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Games.tsx     # Game list with SSE
│   │   │   ├── GameViewer.tsx
│   │   │   ├── Statistics.tsx
│   │   │   ├── Openings.tsx
│   │   │   └── Profile.tsx
│   │   ├── lib/              # Utilities
│   │   │   └── api.ts        # API client
│   │   ├── store/            # Zustand state
│   │   └── App.tsx           # Main app
│   ├── package.json
│   └── Dockerfile.dev
├── docker-compose.yml        # Docker orchestration
├── Makefile                  # Convenience commands
└── README.md
```

## Development

### Convenience Commands (Makefile)

```bash
make restart          # Restart all services
make logs             # View all service logs
make logs-api          # View API logs only
make logs-worker       # View worker logs
make clear-analyses    # Clear all analysis data
make clear-user-games  # Delete all games for a user
```

### Database Migrations

Create a new migration:

```bash
cd backend
alembic revision --autogenerate -m "Description"
```

Apply migrations:

```bash
alembic upgrade head
```

Or from Docker:

```bash
docker compose exec api alembic upgrade head
```

### Monitoring Services

View logs for specific services:

```bash
docker compose logs -f api              # API service
docker compose logs -f stockfish_worker # Analysis workers
docker compose logs -f import_worker    # Import worker
docker compose logs -f redis            # Redis
```

### Testing the System

1. **Test Import**: Import games from Chess.com and verify they queue properly
2. **Test Analysis**: Analyze games and verify SSE updates work
3. **Test Rate Limiting**: Try multiple imports simultaneously - they should queue
4. **Test Idempotency**: Double-click import button - should get 409 error

### Running Tests

Backend:

```bash
cd backend
pytest
```

Frontend:

```bash
cd frontend
npm test
```

### Code Quality

Backend linting:

```bash
cd backend
black .
flake8 .
```

Frontend linting:

```bash
cd frontend
npm run lint
```

## Deployment

### Production Considerations

1. **Security**

   - Generate a secure `SECRET_KEY` for JWT tokens
   - Use environment variables for all secrets
   - Enable HTTPS
   - Set appropriate CORS origins

2. **Database**

   - Use managed PostgreSQL (AWS RDS, DigitalOcean, etc.)
   - Regular backups
   - Connection pooling

3. **Scaling**

   - **API**: Use Gunicorn with Uvicorn workers, load balancer for multiple instances
   - **Workers**: Scale Celery workers horizontally (add more stockfish_worker instances)
   - **Database**: Connection pooling, read replicas for heavy queries
   - **Redis**: Redis Cluster for high availability
   - **Frontend**: CDN for static assets, Vercel/Netlify for hosting

4. **Monitoring**
   - Application monitoring (Sentry, DataDog)
   - Database monitoring
   - Log aggregation

### Deployment Options

- **Backend**: Railway, Render, DigitalOcean App Platform, AWS
- **Frontend**: Vercel, Netlify, Cloudflare Pages
- **Database**: Supabase, Neon, managed PostgreSQL

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Chess.com for their public API
- Stockfish chess engine
- python-chess library
- The open-source community

## Support

For issues, questions, or suggestions:

- Open an issue on GitHub
- Check existing issues for solutions

## Roadmap

Future features planned:

- [ ] Lichess.org integration
- [ ] Puzzle training
- [ ] Opening explorer with common lines
- [ ] Compare with other players
- [ ] Export reports as PDF
- [ ] Mobile app (React Native)
- [ ] Tournament tracking
- [ ] Coach/student features

---

Built with ♟️ by chess enthusiasts, for chess enthusiasts.
