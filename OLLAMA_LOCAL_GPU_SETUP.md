# Ollama Local GPU Setup Guide

This guide walks you through setting up Ollama with Llama 3.1 on your local machine with NVIDIA GPU acceleration, connected to your Dockerized Chess application.

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│           Your Windows Machine              │
│                                             │
│  ┌─────────────────┐                       │
│  │  Ollama Service │  ← Running on Host    │
│  │   (Port 11434)  │     with GPU access   │
│  │   + CUDA/GPU    │                       │
│  └────────┬────────┘                       │
│           │                                 │
│           │ host.docker.internal            │
│           │                                 │
│  ┌────────▼────────────────────────────┐   │
│  │     Docker Network                  │   │
│  │                                     │   │
│  │  ┌──────────┐    ┌──────────┐     │   │
│  │  │ Backend  │────│ Postgres │     │   │
│  │  │Container │    └──────────┘     │   │
│  │  └──────────┘                      │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Key Points:**
- Ollama runs **on your host machine** (NOT in Docker)
- Backend Docker container connects via `host.docker.internal`
- GPU is accessed directly by Ollama on the host
- No complex Docker GPU passthrough needed

## Prerequisites

✅ **You have:**
- Windows 10/11 with WSL2 (if on Windows)
- NVIDIA GPU with CUDA support
- Ollama installed on your machine
- Docker and Docker Compose installed

## Step-by-Step Setup

### 1. Verify NVIDIA GPU and CUDA

First, make sure your GPU is working:

```powershell
# Check if NVIDIA drivers are installed
nvidia-smi
```

You should see output showing your GPU, memory, and driver version. If this doesn't work, install [NVIDIA drivers](https://www.nvidia.com/Download/index.aspx).

### 2. Verify Ollama Installation

```powershell
# Check Ollama version
ollama --version

# List available models (if any)
ollama list
```

### 3. Pull Llama 3.1 Model

Download the Llama 3.1 model:

```powershell
# Download Llama 3.1 8B (Recommended - 4.7GB)
ollama pull llama3.1

# Or for better quality (if you have 64GB+ RAM):
# ollama pull llama3.1:70b
```

This will take a few minutes depending on your internet speed.

### 4. Start Ollama Service

Start the Ollama service:

```powershell
# Start Ollama (keeps running in foreground)
ollama serve
```

**Important:** Keep this terminal window open. Ollama must be running for the chess app to generate coach commentary.

**Tip:** To run in background:
- **Windows:** Use Windows Terminal and create a new tab
- **Or** Run as a service (see Advanced section below)

### 5. Test Ollama

Open a **new terminal** and test Ollama:

```powershell
# Test if Ollama is responding
curl http://localhost:11434/api/tags

# Or test with a quick chat
ollama run llama3.1
>>> Hello!
>>> /bye
```

### 6. Verify Docker Configuration

Your `docker-compose.yml` has been updated with these settings:

```yaml
backend:
  environment:
    ENABLE_COACH: true
    COACH_PROVIDER: ollama
    OLLAMA_BASE_URL: http://host.docker.internal:11434
    OLLAMA_MODEL: llama3.1
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

This allows the Docker container to reach Ollama on your host machine.

### 7. Start Your Chess Application

```bash
# Start the application
docker-compose up -d

# Check backend logs to verify Ollama connection
docker-compose logs -f backend
```

You should see a message like:
```
Using Ollama with model: llama3.1 at http://host.docker.internal:11434
```

### 8. Test the Integration

1. Open your chess app: http://localhost:5173
2. Import a game from Chess.com
3. The analysis should now include AI coach commentary!

## Verifying GPU Usage

While Ollama is generating commentary, check GPU usage:

```powershell
# Watch GPU usage in real-time
nvidia-smi -l 1
```

You should see:
- **GPU-Util** increasing when generating commentary
- **Memory-Usage** showing the model loaded (4-5GB for llama3.1)

## Configuration Options

### Environment Variables

You can customize the backend settings in `docker-compose.yml`:

```yaml
# Use different model
OLLAMA_MODEL: mistral        # Faster, smaller
OLLAMA_MODEL: phi3           # Even smaller
OLLAMA_MODEL: llama3.1:70b   # Higher quality, needs more RAM
```

### Model Size vs Quality

| Model | Size | RAM Needed | Speed | Quality | GPU Memory |
|-------|------|------------|-------|---------|------------|
| phi3 | 2.3GB | 8GB | ⚡⚡⚡ Fast | Good | 3GB |
| mistral | 4GB | 12GB | ⚡⚡ Fast | Very Good | 5GB |
| **llama3.1** | 4.7GB | 16GB | ⚡ Medium | **Excellent** | 6GB |
| llama3.1:70b | 40GB | 64GB+ | 🐌 Slow | Outstanding | 48GB |

**Recommendation:** Start with `llama3.1` - best balance of quality and performance.

## Troubleshooting

### Issue: "Cannot connect to Ollama"

**Solution 1:** Make sure Ollama is running
```powershell
ollama serve
```

**Solution 2:** Test connection from Docker container
```bash
docker-compose exec backend curl http://host.docker.internal:11434/api/tags
```

**Solution 3 (Windows):** If `host.docker.internal` doesn't work, find your WSL IP:
```powershell
# In PowerShell, get WSL IP
wsl hostname -I

# Update docker-compose.yml with actual IP:
OLLAMA_BASE_URL: http://172.x.x.x:11434
```

### Issue: GPU Not Being Used

**Check 1:** Verify NVIDIA drivers
```powershell
nvidia-smi
```

**Check 2:** Ollama should automatically detect GPU. Check console output when running `ollama serve`:
```
NVIDIA GPU detected
Using CUDA
```

**Check 3:** Make sure you're not running Ollama in WSL1 (use WSL2)
```powershell
wsl --list --verbose
# Should show VERSION 2
```

### Issue: Slow Generation (not using GPU)

If commentary takes 30+ seconds:

1. **Verify GPU is detected:**
   ```powershell
   ollama run llama3.1
   >>> /show info
   ```
   Should show GPU information.

2. **Try smaller model:**
   ```powershell
   ollama pull phi3
   # Update docker-compose.yml: OLLAMA_MODEL: phi3
   docker-compose restart backend
   ```

3. **Close other GPU applications** (games, other AI tools)

### Issue: "Model not found"

```powershell
# List installed models
ollama list

# Pull the model if missing
ollama pull llama3.1

# Restart backend
docker-compose restart backend
```

### Issue: Out of Memory

If you get OOM errors:

1. **Use smaller model:**
   ```powershell
   ollama pull phi3
   ```

2. **Close other applications**

3. **Check GPU memory:**
   ```powershell
   nvidia-smi
   ```
   You need ~6GB free for llama3.1

## Advanced: Running Ollama as a Service

To run Ollama automatically in the background:

### Windows (Using NSSM)

1. Download [NSSM](https://nssm.cc/download)
2. Run as administrator:
   ```powershell
   nssm install Ollama "C:\Users\<YourUser>\AppData\Local\Programs\Ollama\ollama.exe" serve
   nssm start Ollama
   ```

### Linux

```bash
# Create systemd service
sudo systemctl enable ollama
sudo systemctl start ollama
```

## Performance Benchmarks

Expected performance with GPU acceleration:

| Model | First Load | Per Commentary | GPU Usage |
|-------|-----------|----------------|-----------|
| phi3 | 2s | 1-2s | ~3GB VRAM |
| mistral | 3s | 2-4s | ~5GB VRAM |
| **llama3.1** | 4s | 3-6s | ~6GB VRAM |
| llama3.1:70b | 10s | 15-30s | ~48GB VRAM |

*Times are for NVIDIA RTX 3060/3070 or equivalent*

## Cost Comparison

### Your Setup (Ollama + GPU):
- ✅ **Cost:** $0
- ⚡ **Speed:** 3-6 seconds per commentary
- 🔒 **Privacy:** Complete (everything local)
- 💻 **Hardware:** Uses your GPU
- ♾️ **Limits:** None

### OpenAI GPT-4:
- 💰 **Cost:** ~$0.05 per game
- ⚡ **Speed:** 1-2 seconds per commentary
- ☁️ **Privacy:** Data sent to OpenAI
- 🌐 **Requires:** Internet connection
- 📊 **Limits:** Rate limits apply

## Quality Comparison

**Your Setup (Llama 3.1 8B):**
> "The move Nc3 blocks your c-pawn and limits central flexibility. Consider Nf3 to maintain better piece coordination and keep options for d4 or c4 pawn breaks."

**OpenAI GPT-4:**
> "Moving the knight to c3 blocked your c-pawn prematurely. Nf3 would have been more flexible, allowing you to maintain central control with d4 or c4 while keeping better piece coordination."

**Both are excellent!** Llama 3.1 is remarkably good for a free, local model.

## Monitoring and Debugging

### View Backend Logs
```bash
docker-compose logs -f backend
```

Look for:
```
Using Ollama with model: llama3.1 at http://host.docker.internal:11434
INFO: Application startup complete
```

### Test Ollama Directly
```powershell
# Test from command line
curl -X POST http://localhost:11434/api/generate -d "{\"model\":\"llama3.1\",\"prompt\":\"Hello\",\"stream\":false}"
```

### Check Connection from Docker
```bash
# Enter backend container
docker-compose exec backend bash

# Test Ollama connection
curl http://host.docker.internal:11434/api/tags
```

## Switching Between Models

You can switch models anytime:

```powershell
# Download another model
ollama pull mistral

# Update docker-compose.yml
# OLLAMA_MODEL: mistral

# Restart backend
docker-compose restart backend
```

The first game analysis will take longer while the new model loads into memory.

## Summary

✅ **Setup Complete:**
1. Ollama running on host with GPU access ✓
2. Llama 3.1 model downloaded ✓
3. Docker configured to connect via `host.docker.internal` ✓
4. Chess app using free AI coaching ✓

**Start Coding:**
```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start Chess App
docker-compose up -d

# Open browser
http://localhost:5173
```

Enjoy unlimited, free AI chess coaching with GPU acceleration! 🎓♟️🚀

## Getting Help

- **Ollama Docs:** https://ollama.com/docs
- **Model Library:** https://ollama.com/library
- **CUDA Setup:** https://developer.nvidia.com/cuda-downloads
- **GitHub Issues:** https://github.com/ollama/ollama/issues





