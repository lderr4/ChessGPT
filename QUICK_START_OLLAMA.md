# Quick Start: Ollama + GPU Setup

## TL;DR - 3 Commands to Get Started

```powershell
# 1. Download Llama 3.1 (if you haven't already)
ollama pull llama3.1

# 2. Run the setup script (rebuilds Docker, starts everything)
.\setup-ollama.ps1

# 3. Open the app
start http://localhost:5173
```

That's it! The script handles everything automatically.

---

## Manual Setup (if you prefer)

### Terminal 1: Start Ollama
```powershell
ollama serve
```
Keep this running!

### Terminal 2: Start Chess App
```powershell
# Rebuild backend with AI dependencies
docker-compose build backend

# Start everything
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

Should see:
```
Using Ollama with model: llama3.1 at http://host.docker.internal:11434
```

---

## Architecture Diagram

```
Your Windows PC
├─ Ollama (on host, port 11434) ← Has GPU access
│  └─ Llama 3.1 model
│
└─ Docker Network
   ├─ Backend ──connects via──> host.docker.internal:11434
   ├─ Frontend (localhost:5173)
   ├─ Postgres
   └─ Redis
```

**Key Point:** Ollama runs OUTSIDE Docker so it can access your GPU directly!

---

## Verify Everything is Working

### 1. Check Ollama
```powershell
curl http://localhost:11434/api/tags
```

### 2. Check GPU Usage
```powershell
nvidia-smi -l 1
```
Watch GPU memory increase when analyzing games!

### 3. Test from Docker
```powershell
docker-compose exec backend curl http://host.docker.internal:11434/api/tags
```

### 4. Import a Game
1. Go to http://localhost:5173
2. Login/Register
3. Import a Chess.com game
4. Look for AI coach commentary on your mistakes!

---

## Configuration (in docker-compose.yml)

Already configured for you:

```yaml
backend:
  environment:
    ENABLE_COACH: true              # Enable AI coach
    COACH_PROVIDER: ollama           # Use Ollama (not OpenAI)
    OLLAMA_BASE_URL: http://host.docker.internal:11434
    OLLAMA_MODEL: llama3.1          # Model to use
  extra_hosts:
    - "host.docker.internal:host-gateway"  # Connect to host
```

---

## Troubleshooting One-Liners

**Can't connect to Ollama?**
```powershell
# Make sure it's running
ollama serve
```

**GPU not being used?**
```powershell
# Check GPU is detected
nvidia-smi

# Verify Ollama sees it (should show CUDA info)
ollama run llama3.1
>>> /show info
>>> /bye
```

**Backend errors?**
```powershell
# View logs
docker-compose logs -f backend

# Rebuild if needed
docker-compose build backend
docker-compose up -d
```

**Want to try a different model?**
```powershell
# Download it
ollama pull mistral

# Edit docker-compose.yml
# Change: OLLAMA_MODEL: mistral

# Restart
docker-compose restart backend
```

---

## What You Get

✅ **FREE** AI chess coaching  
✅ **GPU accelerated** (3-6 seconds per analysis)  
✅ **No API keys** needed  
✅ **Complete privacy** (all data stays local)  
✅ **Unlimited** analysis  

---

## Full Documentation

- **Complete Setup Guide:** `OLLAMA_LOCAL_GPU_SETUP.md`
- **Feature Comparison:** `FREE_CHESS_COACH_SETUP.md`
- **Main README:** `README.md`

---

## Quick Commands Reference

```powershell
# Start Ollama
ollama serve

# Download a model
ollama pull llama3.1

# List installed models
ollama list

# Start app
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop app
docker-compose down

# Monitor GPU
nvidia-smi -l 1

# Test Ollama
curl http://localhost:11434/api/tags
```

---

**Ready to analyze chess games with FREE AI coaching? Let's go! 🎓♟️🚀**




