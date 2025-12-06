# FREE Chess Coach Setup with Ollama

Run the AI Chess Coach **completely free** using Ollama - a local LLM runner that requires no API keys or internet connection!

## What is Ollama?

Ollama lets you run large language models (like Llama, Mistral, Phi) locally on your computer for **FREE**. No API costs, no rate limits, complete privacy.

## Quick Setup (5 minutes)

### Step 1: Install Ollama

**Windows:**
```bash
# Download and run the installer
https://ollama.com/download/windows
```

**Mac:**
```bash
# Download and run the installer
https://ollama.com/download/mac
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Step 2: Download a Model

Open a terminal and download a chess-capable model:

```bash
# Recommended: Llama 3.1 (8B) - Great quality, ~4.7GB
ollama pull llama3.1

# Alternative options:
# ollama pull mistral        # Fast, good quality, 4GB
# ollama pull phi3           # Smaller, faster, 2.3GB
# ollama pull llama3.1:70b   # Best quality but large, ~40GB
```

### Step 3: Configure Your Backend

Update your `.env` file:

```bash
# Enable the Chess Coach
ENABLE_COACH=true

# Use Ollama (FREE!)
COACH_PROVIDER=ollama

# Ollama settings
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# No need for OpenAI API key!
```

### Step 4: Start Ollama

```bash
# Start the Ollama service
ollama serve
```

Keep this terminal open. Ollama will run in the background.

### Step 5: Restart Your Backend

```bash
docker-compose restart backend
```

### Step 6: Test It!

Import and analyze a game - coach commentary will now be generated **completely free**!

## Model Recommendations

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| **llama3.1** | 4.7GB | Medium | Excellent | **Recommended - Best balance** |
| mistral | 4GB | Fast | Very Good | Faster responses |
| phi3 | 2.3GB | Very Fast | Good | Lower-end hardware |
| llama3.1:70b | 40GB | Slow | Outstanding | High-end systems only |

Test with `llama3.1` first - it provides excellent chess coaching quality.

## Switching Between Free & Paid

You can easily switch between Ollama (free) and OpenAI (paid):

### Use Free Ollama:
```bash
COACH_PROVIDER=ollama
OLLAMA_MODEL=llama3.1
```

### Use Paid OpenAI (better quality):
```bash
COACH_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4
```

## System Requirements

### Minimum (for phi3):
- 8GB RAM
- 5GB disk space
- Any modern CPU

### Recommended (for llama3.1):
- 16GB RAM
- 10GB disk space
- Modern CPU (Intel i5/Ryzen 5 or better)

### High-end (for llama3.1:70b):
- 64GB RAM
- 50GB disk space
- Powerful CPU or GPU

## Performance

**Ollama (Local):**
- ✅ 100% Free
- ✅ No rate limits
- ✅ Complete privacy
- ✅ Works offline
- ⏱️ 3-10 seconds per commentary
- 💻 Uses your hardware

**OpenAI (Cloud):**
- 💰 Costs $0.03-0.05 per game
- ⚡ 1-2 seconds per commentary
- 🌐 Requires internet
- ☁️ Uses OpenAI's servers

## Troubleshooting

### "Cannot connect to Ollama"

1. Make sure Ollama is running:
   ```bash
   ollama serve
   ```

2. Check if the model is downloaded:
   ```bash
   ollama list
   ```

3. Verify Ollama is accessible:
   ```bash
   curl http://localhost:11434/api/tags
   ```

### Slow Generation

- Use a smaller model: `ollama pull phi3`
- Close other applications
- Consider upgrading RAM
- Or switch to OpenAI for faster responses

### Poor Quality Commentary

- Try a larger model: `ollama pull llama3.1:70b`
- Or switch to OpenAI's GPT-4 for premium quality
- Adjust the temperature in `coach_service.py` (0.5-0.9)

### Model Download Failed

- Check internet connection
- Try a smaller model first
- Free up disk space
- Restart download (Ollama resumes automatically)

## Quality Comparison

### Llama 3.1 (Free) Example:
> "Moving the knight to c3 blocks your own c-pawn and limits future pawn breaks. Consider Nf3 to maintain flexibility and prepare castling while keeping the center fluid."

### GPT-4 (Paid) Example:
> "Moving the knight to c3 allowed Black's bishop to dominate the long diagonal. Consider defending the center with d3 or developing with Nf3 to maintain piece coordination."

**Both provide excellent coaching!** Llama 3.1 is remarkably good for a free, local model.

## Privacy Benefits

With Ollama:
- ✅ All your games stay on your computer
- ✅ No data sent to external servers
- ✅ No API tracking or logging
- ✅ Complete control over the model

## Advanced: GPU Acceleration

If you have an NVIDIA GPU:

1. Install NVIDIA drivers
2. Ollama automatically uses GPU
3. 5-10x faster generation
4. Can run larger models (70B+)

Check GPU usage:
```bash
nvidia-smi
```

## Cost Comparison

### 100 Games Analyzed:

**Ollama (Free):**
- Cost: $0
- Time: 5-10 min per game
- Privacy: Complete

**OpenAI GPT-4:**
- Cost: $3-5
- Time: 1-2 min per game
- Privacy: Data sent to OpenAI

**OpenAI GPT-3.5:**
- Cost: $0.30-0.50
- Time: 1-2 min per game
- Privacy: Data sent to OpenAI

## Recommendation

**Start with Ollama (free)** and see if you like the quality and speed. You can always switch to OpenAI later for faster responses or premium quality.

For most users, **Llama 3.1 with Ollama** provides excellent coaching at zero cost!

## Commands Cheat Sheet

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Download model
ollama pull llama3.1

# Start Ollama
ollama serve

# List installed models
ollama list

# Remove a model
ollama rm phi3

# Check Ollama status
curl http://localhost:11434/api/tags

# Update .env
ENABLE_COACH=true
COACH_PROVIDER=ollama
OLLAMA_MODEL=llama3.1

# Restart backend
docker-compose restart backend
```

## Getting Help

- Ollama Docs: https://ollama.com/docs
- Available Models: https://ollama.com/library
- GitHub Issues: https://github.com/ollama/ollama/issues

Enjoy free AI chess coaching! 🎓♟️

