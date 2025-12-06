#!/bin/bash

# Chess Analytics Platform - Stop Script

echo "🛑 Stopping Chess Analytics Platform..."

docker-compose down

echo "✅ All services stopped."
echo ""
echo "💡 To start again: ./start.sh"
echo "🗑️  To remove all data: docker-compose down -v"

