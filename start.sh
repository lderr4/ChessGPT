#!/bin/bash

# Chess Analytics Platform - Startup Script

echo "🚀 Starting Chess Analytics Platform..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env exists in backend
if [ ! -f backend/.env ]; then
    echo "⚠️  No .env file found in backend/"
    echo "Creating .env file from example..."
    cp backend/.env.example backend/.env 2>/dev/null || {
        echo "📝 Please create backend/.env file with the following variables:"
        echo "   DATABASE_URL=postgresql://chess_user:chess_password@postgres:5432/chess_analytics"
        echo "   SECRET_KEY=<generate-a-secure-key>"
        echo "   CHESS_COM_USER_AGENT=ChessAnalytics/1.0 (contact: your-email@example.com)"
        echo ""
        echo "💡 Generate a secure SECRET_KEY with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
        exit 1
    }
fi

# Start Docker Compose
echo "🐳 Starting Docker containers..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services started successfully!"
    echo ""
    echo "📍 Access the application:"
    echo "   Frontend: http://localhost:5173"
    echo "   Backend API: http://localhost:8000"
    echo "   API Docs: http://localhost:8000/docs"
    echo ""
    echo "📊 To view logs: docker-compose logs -f"
    echo "🛑 To stop: docker-compose down"
else
    echo "❌ Failed to start services. Check logs with: docker-compose logs"
    exit 1
fi

