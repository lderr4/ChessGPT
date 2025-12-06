# Chess Analytics Backend

FastAPI backend for chess game analytics platform.

## Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Set Up Environment Variables

Create a `.env` file in the backend directory:

```env
DATABASE_URL=postgresql://chess_user:chess_password@localhost:5432/chess_analytics
SECRET_KEY=your-secret-key-here-generate-a-secure-one
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
CHESS_COM_USER_AGENT=ChessAnalytics/1.0 (contact: your-email@example.com)
STOCKFISH_PATH=/usr/games/stockfish
STOCKFISH_DEPTH=20
STOCKFISH_TIME_LIMIT=1.0
REDIS_URL=redis://localhost:6379/0
ENVIRONMENT=development
```

### 3. Set Up PostgreSQL Database

```bash
# Create database and user
psql -U postgres
CREATE DATABASE chess_analytics;
CREATE USER chess_user WITH PASSWORD 'chess_password';
GRANT ALL PRIVILEGES ON DATABASE chess_analytics TO chess_user;
\q
```

### 4. Install Stockfish

**Ubuntu/Debian:**

```bash
sudo apt-get install stockfish
```

**macOS:**

```bash
brew install stockfish
```

**Windows:**
Download from https://stockfishchess.org/download/ and update `STOCKFISH_PATH` in `.env`

### 5. Run Database Migrations

```bash
alembic upgrade head
```

### 6. Run the Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Alternative docs: http://localhost:8000/redoc

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get tokens
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/me` - Update user profile

### Games

- `GET /api/games/` - List user's games (with filters)
- `GET /api/games/{game_id}` - Get game details with moves
- `POST /api/games/import` - Import games from Chess.com
- `POST /api/games/{game_id}/analyze` - Analyze a specific game
- `DELETE /api/games/{game_id}` - Delete a game

### Statistics

- `GET /api/stats/` - Get overall user statistics
- `GET /api/stats/openings` - Get opening statistics
- `GET /api/stats/time-controls` - Get stats by time control
- `GET /api/stats/performance-over-time` - Get performance trends
- `GET /api/stats/dashboard` - Get all dashboard data
- `POST /api/stats/recalculate` - Force stats recalculation

## Development

### Generate Secret Key

```python
import secrets
print(secrets.token_urlsafe(32))
```

### Database Migrations

Create a new migration:

```bash
alembic revision --autogenerate -m "Description"
```

Apply migrations:

```bash
alembic upgrade head
```

Rollback migration:

```bash
alembic downgrade -1
```

## Architecture

- **FastAPI** - Modern Python web framework
- **SQLAlchemy** - ORM for database operations
- **PostgreSQL** - Primary database
- **python-chess** - Chess library for game parsing
- **Stockfish** - Chess engine for position analysis
- **JWT** - Authentication tokens
- **Background Tasks** - Async game import and analysis
