# Chess Coach AI Setup Guide

The Chess Coach feature uses AI to provide natural language commentary on key moments in your chess games.

## 🎯 Two Options Available

### Option 1: FREE with Ollama (Recommended to start)

- ✅ **100% Free** - No API costs ever
- ✅ Runs locally on your computer
- ✅ Complete privacy
- ✅ Works offline
- ⏱️ 3-10 seconds per commentary
- 📖 **See [FREE_CHESS_COACH_SETUP.md](FREE_CHESS_COACH_SETUP.md) for setup**

### Option 2: Paid with OpenAI

- 💰 ~$0.03-0.05 per game
- ⚡ 1-2 seconds per commentary (faster)
- 🌟 Premium quality (GPT-4)
- 🌐 Requires internet
- 📖 **Setup instructions below**

## Features

- **Intelligent Commentary**: AI-powered explanations for blunders, mistakes, and inaccuracies
- **Educational Insights**: Learn what you should have considered and why moves were problematic
- **Visual Indicators**: See which moves have coach commentary with 🎓 icons
- **Seamless Integration**: Commentary appears naturally in the Game Viewer alongside move analysis

## Setup Instructions

Choose your preferred option:

---

### ⭐ Option 1: FREE with Ollama (Recommended to try first)

**Quick Steps:**

1. Install Ollama from https://ollama.com/download
2. Run: `ollama pull llama3.1`
3. Run: `ollama serve`
4. Add to `.env`:

```bash
ENABLE_COACH=true
COACH_PROVIDER=ollama
OLLAMA_MODEL=llama3.1
```

**📖 Full instructions: [FREE_CHESS_COACH_SETUP.md](FREE_CHESS_COACH_SETUP.md)**

---

### 💰 Option 2: Paid with OpenAI (Faster, Premium Quality)

**1. Get an OpenAI API Key:**

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (you won't be able to see it again)

**2. Configure the Backend:**

Add the following environment variables to your `.env` file:

```bash
# OpenAI Configuration (PAID)
ENABLE_COACH=true
COACH_PROVIDER=openai
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4
```

**Environment Variables:**

- `ENABLE_COACH`: Enable/disable the coach feature
- `COACH_PROVIDER`: Use "ollama" (free) or "openai" (paid)
- `OPENAI_API_KEY`: Your OpenAI API key (only for OpenAI)
- `OPENAI_MODEL`: Model to use: `gpt-4` (best) or `gpt-3.5-turbo` (cheaper)
- `OLLAMA_MODEL`: Model for Ollama: `llama3.1` (recommended), `mistral`, or `phi3`

---

### 3. Install Dependencies

The OpenAI Python package has been added to `requirements.txt`. Install it:

```bash
cd backend
pip install -r requirements.txt
```

Or with Docker:

```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### 4. Run Database Migration

Apply the new database migration to add the `coach_commentary` column:

```bash
cd backend

# Using docker-compose
docker-compose exec backend alembic upgrade head

# Or manually
psql -U your_username -d chess_analytics -f migrations/004_add_coach_commentary.sql
```

### 5. Restart the Backend

```bash
docker-compose restart backend
```

## Usage

Once configured, the Chess Coach will automatically:

1. **During Game Analysis**: Generate commentary for moves classified as blunders, mistakes, or inaccuracies
2. **In Game Viewer**: Display coaching insights in a purple-highlighted box below move analysis
3. **In Move List**: Show 🎓 icons next to moves with available commentary

## Cost Considerations

- Commentary is generated **only for key moments** (blunders, mistakes, inaccuracies)
- Each commentary costs approximately 0.5-1 cent (GPT-4) or less (GPT-3.5)
- Commentary is **stored in the database** and not regenerated
- Average game with 3-5 mistakes = $0.03-$0.05 per game

**To minimize costs:**

- Use `gpt-3.5-turbo` instead of `gpt-4` (10x cheaper)
- Set `ENABLE_COACH=false` when not needed
- Commentary is only for your moves, not opponent moves

## Disabling the Feature

To disable the Chess Coach:

1. Set `ENABLE_COACH=false` in your `.env` file
2. Restart the backend

Existing commentary will remain in the database and continue to display.

## Technical Details

### Backend Components

- **CoachService** (`backend/app/services/coach_service.py`): Manages OpenAI API calls
- **AnalysisService** (`backend/app/services/analysis_service.py`): Integrates coach commentary into game analysis
- **Database**: New `coach_commentary` column in `moves` table

### Frontend Components

- **GameViewer** (`frontend/src/pages/GameViewer.tsx`): Displays commentary with visual styling
- **Move Interface**: Updated to include `coach_commentary` field

## Troubleshooting

### No Commentary Appearing

1. Check `ENABLE_COACH=true` in `.env`
2. Verify `OPENAI_API_KEY` is set correctly
3. Check backend logs for OpenAI API errors
4. Ensure database migration has been applied

### API Errors

- **401 Unauthorized**: Invalid API key
- **429 Rate Limit**: Too many requests (wait or upgrade plan)
- **500 Internal Error**: Check backend logs

### Commentary Quality

If commentary quality is not satisfactory:

- Switch to `gpt-4` for better responses (from `gpt-3.5-turbo`)
- Check that game analysis is accurate (Stockfish working properly)
- Report issues with specific examples

## Example Output

When viewing a game with mistakes, you'll see:

```
🎓 Coach's Insight
Moving the knight to c3 allowed Black's bishop to dominate the long
diagonal. Consider defending the center with d3 or developing with Nf3
to maintain piece coordination.
```

## Support

For issues or questions:

1. Check backend logs: `docker-compose logs backend`
2. Verify OpenAI API status: https://status.openai.com/
3. Review the implementation in `backend/app/services/coach_service.py`
