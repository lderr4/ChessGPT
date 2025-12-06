# Chess Analytics - Setup Guide

This guide will help you get the Chess Analytics platform up and running.

## Quick Start (Docker)

### 1. Prerequisites

Make sure you have installed:
- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### 2. Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd chess

# Generate a secure secret key
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Create backend/.env file
cat > backend/.env << EOF
DATABASE_URL=postgresql://chess_user:chess_password@postgres:5432/chess_analytics
SECRET_KEY=ZV9cItBNhLrsVAWZdxV0ffK_660unGxK9L1IJUe7Bcc
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
CHESS_COM_USER_AGENT=ChessAnalytics/1.0 (contact: your-email@example.com)
STOCKFISH_PATH=/usr/games/stockfish
STOCKFISH_DEPTH=20
STOCKFISH_TIME_LIMIT=1.0
REDIS_URL=redis://redis:6379/0
ENVIRONMENT=development
EOF
```

### 3. Start the Platform

```bash
# Make start script executable
chmod +x start.sh

# Start all services
./start.sh
```

This will start:
- PostgreSQL database
- Redis cache
- Backend API server
- Frontend development server

### 4. Access the Application

Open your browser and navigate to:
- **Frontend**: http://localhost:5173
- **API Documentation**: http://localhost:8000/docs
- **API**: http://localhost:8000

### 5. Create Your Account

1. Go to http://localhost:5173
2. Click "Sign up"
3. Fill in your details
4. Add your Chess.com username (optional, can be added later)

### 6. Import Your Games

1. Navigate to the Profile page
2. Enter your Chess.com username
3. Click "Import Games from Chess.com"
4. Wait for the import to complete

### 7. View Your Analytics

Once games are imported:
- **Dashboard**: See your overall performance
- **Games**: Browse your game library
- **Statistics**: Dive into detailed analytics
- **Openings**: Discover your best openings

## Manual Setup (Without Docker)

### Backend Setup

1. **Install Python 3.10+**

2. **Install PostgreSQL**
```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# macOS
brew install postgresql
```

3. **Create Database**
```bash
sudo -u postgres psql
CREATE DATABASE chess_analytics;
CREATE USER chess_user WITH PASSWORD 'chess_password';
GRANT ALL PRIVILEGES ON DATABASE chess_analytics TO chess_user;
\q
```

4. **Install Stockfish**
```bash
# Ubuntu/Debian
sudo apt-get install stockfish

# macOS
brew install stockfish

# Windows
# Download from https://stockfishchess.org/download/
# Update STOCKFISH_PATH in .env to point to stockfish.exe
```

5. **Install Python Dependencies**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

6. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your settings
```

7. **Run Migrations**
```bash
alembic upgrade head
```

8. **Start Backend**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

1. **Install Node.js 18+**

2. **Install Dependencies**
```bash
cd frontend
npm install
```

3. **Configure Environment**
```bash
echo "VITE_API_URL=http://localhost:8000" > .env
```

4. **Start Frontend**
```bash
npm run dev
```

## Troubleshooting

### Docker Issues

**Ports already in use:**
```bash
# Check what's using the ports
lsof -i :5173  # Frontend
lsof -i :8000  # Backend
lsof -i :5432  # PostgreSQL

# Stop conflicting services or change ports in docker-compose.yml
```

**Database connection errors:**
```bash
# Check if PostgreSQL is running
docker-compose ps

# View logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

**Stockfish not found:**
```bash
# Install Stockfish in the backend container
docker-compose exec backend apt-get update
docker-compose exec backend apt-get install -y stockfish
```

### Manual Setup Issues

**PostgreSQL connection refused:**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list  # macOS

# Start PostgreSQL
sudo systemctl start postgresql  # Linux
brew services start postgresql  # macOS
```

**Stockfish not found:**
```bash
# Check Stockfish installation
which stockfish

# Update STOCKFISH_PATH in backend/.env to the correct path
```

**Import errors:**
```bash
# Make sure all Python packages are installed
pip install -r requirements.txt

# Check Python version (should be 3.10+)
python --version
```

## Advanced Configuration

### Custom Database

To use a different database:

1. Update `DATABASE_URL` in `backend/.env`
2. Update `docker-compose.yml` if using Docker

### Custom Ports

To change the default ports:

1. **Backend**: Edit `docker-compose.yml` or run with `--port` flag
2. **Frontend**: Edit `vite.config.ts` and `docker-compose.yml`
3. **Database**: Edit `docker-compose.yml`

### Production Deployment

For production:

1. **Use secure passwords** for database
2. **Generate strong SECRET_KEY**
3. **Set ENVIRONMENT=production**
4. **Use managed database** (AWS RDS, etc.)
5. **Enable HTTPS**
6. **Set proper CORS origins**
7. **Use production-ready servers** (Gunicorn, Nginx)

## Getting Help

If you encounter issues:

1. Check the logs:
   ```bash
   # Docker
   docker-compose logs backend
   docker-compose logs frontend
   
   # Manual
   # Backend logs in terminal
   # Frontend logs in browser console
   ```

2. Verify all services are running:
   ```bash
   docker-compose ps
   ```

3. Check environment variables:
   ```bash
   cat backend/.env
   ```

4. Open an issue on GitHub with:
   - Error messages
   - Steps to reproduce
   - Environment details (OS, Docker version, etc.)

## Next Steps

After setup:

1. **Customize your profile** with Chess.com username
2. **Import games** to start analyzing
3. **Explore the dashboard** to see your stats
4. **Review individual games** for detailed insights
5. **Study your openings** to improve your repertoire

Happy analyzing! ♟️

