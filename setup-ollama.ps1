# Ollama Setup Script for Windows
# This script helps you set up Ollama with your Chess application

Write-Host "🎓 Chess GPT - Ollama Local GPU Setup" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

# Check if Ollama is installed
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow
try {
    $ollamaVersion = & ollama --version 2>&1
    Write-Host "✅ Ollama is installed: $ollamaVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Ollama is not installed!" -ForegroundColor Red
    Write-Host "Please download and install from: https://ollama.com/download/windows" -ForegroundColor Yellow
    exit 1
}

# Check if NVIDIA GPU is available
Write-Host ""
Write-Host "🎮 Checking GPU..." -ForegroundColor Yellow
try {
    $nvidiaCheck = & nvidia-smi 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ NVIDIA GPU detected!" -ForegroundColor Green
        $gpuLine = ($nvidiaCheck | Select-String "NVIDIA").Line
        Write-Host "   $gpuLine" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  NVIDIA GPU not detected. Ollama will use CPU (slower)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  nvidia-smi not found. Ollama will use CPU (slower)" -ForegroundColor Yellow
}

# Check if llama3.1 model is installed
Write-Host ""
Write-Host "🤖 Checking for Llama 3.1 model..." -ForegroundColor Yellow
$ollamaList = & ollama list 2>&1
if ($ollamaList -match "llama3.1") {
    Write-Host "✅ Llama 3.1 model is already installed!" -ForegroundColor Green
} else {
    Write-Host "📥 Llama 3.1 not found. Would you like to download it? (4.7GB)" -ForegroundColor Yellow
    $download = Read-Host "Download llama3.1? (y/n)"
    if ($download -eq "y" -or $download -eq "Y") {
        Write-Host "⏬ Downloading llama3.1... This may take a few minutes..." -ForegroundColor Cyan
        & ollama pull llama3.1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Llama 3.1 downloaded successfully!" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to download llama3.1" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "⏭️  Skipping download. You can download later with: ollama pull llama3.1" -ForegroundColor Yellow
    }
}

# Check if Docker is running
Write-Host ""
Write-Host "🐳 Checking Docker..." -ForegroundColor Yellow
try {
    $dockerCheck = & docker ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker is running!" -ForegroundColor Green
    } else {
        Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Docker is not installed or not running." -ForegroundColor Red
    exit 1
}

# Rebuild backend container with dependencies
Write-Host ""
Write-Host "🔨 Rebuilding backend container with AI coach dependencies..." -ForegroundColor Yellow
& docker-compose build backend
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend rebuilt successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to rebuild backend" -ForegroundColor Red
    exit 1
}

# Start Ollama in background
Write-Host ""
Write-Host "🚀 Starting Ollama service..." -ForegroundColor Yellow
$ollamaProcess = Get-Process -Name ollama -ErrorAction SilentlyContinue
if ($ollamaProcess) {
    Write-Host "✅ Ollama is already running (PID: $($ollamaProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "Starting Ollama in a new window..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "ollama serve" -WindowStyle Normal
    Start-Sleep -Seconds 3
    Write-Host "✅ Ollama started!" -ForegroundColor Green
}

# Test Ollama connection
Write-Host ""
Write-Host "🔍 Testing Ollama connection..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 5
    Write-Host "✅ Ollama is responding!" -ForegroundColor Green
    Write-Host "   Available models:" -ForegroundColor Cyan
    foreach ($model in $response.models) {
        Write-Host "   - $($model.name)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Cannot connect to Ollama. Please start it manually:" -ForegroundColor Red
    Write-Host "   ollama serve" -ForegroundColor Yellow
    exit 1
}

# Start Docker containers
Write-Host ""
Write-Host "🐳 Starting Chess application..." -ForegroundColor Yellow
& docker-compose up -d
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Application started!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to start application" -ForegroundColor Red
    exit 1
}

# Wait for backend to be ready
Write-Host ""
Write-Host "⏳ Waiting for backend to start..." -ForegroundColor Yellow
$maxRetries = 30
$retries = 0
while ($retries -lt $maxRetries) {
    try {
        $healthCheck = Invoke-RestMethod -Uri "http://localhost:8000/docs" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
        Write-Host "✅ Backend is ready!" -ForegroundColor Green
        break
    } catch {
        $retries++
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 1
    }
}

if ($retries -ge $maxRetries) {
    Write-Host ""
    Write-Host "⚠️  Backend took longer than expected. Check logs with:" -ForegroundColor Yellow
    Write-Host "   docker-compose logs -f backend" -ForegroundColor Cyan
}

# Display status
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    Setup Complete! 🎉                       ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Frontend:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "📡 Backend:   http://localhost:8000" -ForegroundColor Cyan
Write-Host "📚 API Docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "🤖 Ollama:    http://localhost:11434" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open http://localhost:5173 in your browser" -ForegroundColor White
Write-Host "2. Login or register" -ForegroundColor White
Write-Host "3. Import a game from Chess.com" -ForegroundColor White
Write-Host "4. Enjoy FREE AI coaching powered by your GPU! 🚀" -ForegroundColor White
Write-Host ""
Write-Host "To view backend logs:" -ForegroundColor Yellow
Write-Host "  docker-compose logs -f backend" -ForegroundColor Cyan
Write-Host ""
Write-Host "To monitor GPU usage:" -ForegroundColor Yellow
Write-Host "  nvidia-smi -l 1" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop everything:" -ForegroundColor Yellow
Write-Host "  docker-compose down" -ForegroundColor Cyan
Write-Host "  Stop the Ollama window" -ForegroundColor Cyan
Write-Host ""

















