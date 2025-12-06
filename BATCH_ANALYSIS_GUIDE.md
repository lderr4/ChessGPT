# Batch Analysis Feature Guide 🚀

## Overview

The batch analysis feature allows you to analyze **all your unanalyzed games at once** with Stockfish. This is perfect for when you've imported many games and want to analyze them all in the background.

## Setup

### 1. Run Database Migration

First, you need to add the new `analysis_jobs` table to track batch analysis progress:

```bash
# Option 1: Using Docker (recommended)
docker-compose exec db psql -U postgres -d chess_analytics -f /app/backend/migrations/003_add_analysis_jobs.sql

# Option 2: Manual psql
psql -U postgres -d chess_analytics -f backend/migrations/003_add_analysis_jobs.sql

# Option 3: Recreate the database (loses all data)
docker-compose down -v
docker-compose up -d
```

### 2. Restart Services

```bash
docker-compose restart backend frontend
```

## How to Use

### From the UI:

1. **Navigate to Games Page** - Click "Games" in the navigation
2. **Click "Analyze All Games"** - Purple button in the top right
3. **Read the Warning** - A modal will appear explaining:
   - ⏰ Each game takes ~30-60 seconds
   - 🔄 Analysis runs in the background
   - 💤 You can close the page and come back later
4. **Start Analysis** - Click "Start Analysis" to begin
5. **Track Progress** - A purple progress bar will appear showing:
   - Number of games analyzed (e.g., "42/100 games")
   - Percentage complete
   - Reminder that you can close the page

### What Happens:

```
User clicks "Analyze All Games"
    ↓
Backend counts unanalyzed games
    ↓
Creates an AnalysisJob to track progress
    ↓
Starts background task
    ↓
For each game:
  • Runs Stockfish analysis (~30-60s)
  • Stores move-by-move evaluations
  • Updates progress in database
    ↓
Updates user statistics
    ↓
Marks job as completed
```

## Technical Details

### Backend Endpoints:

- **`POST /api/games/analyze/all`** - Start batch analysis
  - Returns: `job_id`, `total_games`, `estimated_time_minutes`
  
- **`GET /api/games/analyze/status/{job_id}`** - Check progress
  - Returns: `status`, `progress`, `analyzed_games`, `total_games`

### Database Model:

```python
class AnalysisJob:
    id: int
    user_id: int
    status: str  # pending, processing, completed, failed
    progress: int  # 0-100
    total_games: int
    analyzed_games: int
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
```

### Status Polling:

- Frontend polls every **5 seconds** for status updates
- Each game takes approximately **30-60 seconds** to analyze
- Total time = (number_of_games × 37.5 seconds) / 60 minutes

## Estimated Analysis Times

| Games | Time     |
|-------|----------|
| 10    | ~6 min   |
| 50    | ~31 min  |
| 100   | ~62 min  |
| 500   | ~5 hours |
| 1000  | ~10 hours|

## Important Notes

⚠️ **Long-Running Process**
- Analysis runs in the background on the server
- You can close your browser - it will keep running
- Come back anytime to check progress

⚠️ **Server Resources**
- Each analysis uses Stockfish engine
- Don't run multiple batch analyses simultaneously
- The button is disabled while analysis is in progress

⚠️ **Error Handling**
- If a game fails to analyze, it's marked as "analyzed" to prevent retries
- The batch continues with remaining games
- Check logs for specific errors

## UI Components

### 1. Analyze All Games Button
- **Location**: Top right of Games page (purple button)
- **Icon**: ⚡ Zap icon
- **State**: Disabled during batch analysis

### 2. Warning Modal
- **Appears**: When you click the button
- **Contains**:
  - Explanation of the feature
  - Time warning with amber background
  - Reminder you can close the page
  - Cancel / Start Analysis buttons

### 3. Progress Banner
- **Appears**: During batch analysis
- **Shows**:
  - Spinner animation
  - "X / Y games analyzed (Z%)"
  - Progress bar
  - Reminder to come back later

### 4. Individual Game Analysis (unchanged)
- You can still analyze individual games
- Click the "⚡ Analyze" button on any game
- Takes ~30-60 seconds per game

## Troubleshooting

### "No unanalyzed games found"
- All your games are already analyzed!
- Import more games from Chess.com to analyze

### Analysis seems stuck
1. Check backend logs: `docker-compose logs backend`
2. Check Stockfish is running: `docker-compose exec backend which stockfish`
3. Restart backend: `docker-compose restart backend`

### Progress not updating
- Frontend polls every 5 seconds
- Refresh the page manually if needed
- Check browser console for errors

## Example Usage

```typescript
// Frontend API call
const response = await gamesAPI.analyzeAllGames();
// { job_id: 123, total_games: 50, estimated_time_minutes: 31 }

// Check status
const status = await gamesAPI.getAnalysisStatus(123);
// { status: "processing", progress: 42, analyzed_games: 21, total_games: 50 }
```

## Files Changed

**Backend:**
- `backend/app/models.py` - Added `AnalysisJob` model
- `backend/app/routers/games.py` - Added batch analysis endpoints
- `backend/migrations/003_add_analysis_jobs.sql` - Database migration

**Frontend:**
- `frontend/src/lib/api.ts` - Added API client methods
- `frontend/src/pages/Games.tsx` - Added UI components

## Benefits

✅ **Analyze hundreds of games overnight**
✅ **No need to click each game individually**
✅ **Background processing - don't wait around**
✅ **Progress tracking - know exactly where you are**
✅ **Error resilient - continues if one game fails**
✅ **Come back anytime - analysis persists**

Enjoy your automated analysis! 🎉

