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
- **Multi-user Support**: Full authentication system
- **Scalable Backend**: FastAPI with PostgreSQL
- **Modern Frontend**: React with TypeScript and Tailwind CSS
- **Real-time Analysis**: Background tasks for game analysis
- **Responsive Design**: Works on desktop and mobile

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **PostgreSQL**: Robust relational database
- **SQLAlchemy**: ORM for database operations
- **python-chess**: Chess library for game parsing
- **Stockfish**: World-class chess engine
- **JWT**: Secure authentication
- **Alembic**: Database migrations

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
- PostgreSQL database (port 5432)
- Redis (port 6379)
- Backend API (port 8000)
- Frontend (port 5173)

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
- Games will be automatically queued for analysis
- Analysis runs in the background using Stockfish
- Check back later to see analysis results

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
- `POST /api/games/import` - Import games from Chess.com
- `POST /api/games/{id}/analyze` - Analyze a game
- `DELETE /api/games/{id}` - Delete a game

### Statistics
- `GET /api/stats/` - Get user statistics
- `GET /api/stats/openings` - Get opening statistics
- `GET /api/stats/time-controls` - Get time control stats
- `GET /api/stats/performance-over-time` - Get trends
- `GET /api/stats/dashboard` - Get dashboard data

## Project Structure

```
chess/
├── backend/
│   ├── app/
│   │   ├── routers/       # API endpoints
│   │   ├── services/      # Business logic
│   │   ├── models.py      # Database models
│   │   ├── schemas.py     # Pydantic schemas
│   │   ├── auth.py        # Authentication
│   │   ├── config.py      # Configuration
│   │   ├── database.py    # Database connection
│   │   └── main.py        # FastAPI app
│   ├── alembic/           # Database migrations
│   ├── requirements.txt   # Python dependencies
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── lib/           # API client
│   │   ├── store/         # State management
│   │   └── App.tsx        # Main app
│   ├── package.json       # Node dependencies
│   └── Dockerfile.dev
├── docker-compose.yml     # Docker orchestration
├── chess.py              # Original Chess.com API script
└── README.md             # This file
```

## Development

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
   - Use a proper ASGI server (Gunicorn with Uvicorn workers)
   - Load balancer for multiple instances
   - CDN for frontend assets
   - Redis for caching

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

