# Chess Game Analysis Guide

## How Analysis Works

### What Gets Analyzed

When you analyze a game, the Stockfish chess engine evaluates:
- **Every move** you made in the game
- **Position evaluation** (in centipawns)
- **Best move** suggestions
- **Move classification**: Best, Excellent, Good, Inaccuracy (?!), Mistake (?), Blunder (??)
- **Accuracy score** (0-100%)
- **Average centipawn loss**

### Analysis Process

1. **Import Games** - Games are imported with metadata (opening, result, players, ratings)
2. **Trigger Analysis** - Click the "Analyze" button on any game in the Games page
3. **Background Processing** - Stockfish analyzes the game (takes ~30-60 seconds per game)
4. **View Results** - Once analyzed, you can:
   - Click through moves in the Game Viewer
   - See move annotations (!, ??, etc.)
   - View accuracy and error statistics
   - See position evaluations

### Why Games Aren't Auto-Analyzed

**Time Considerations:**
- Each game takes 30-60 seconds to analyze
- 100 games = 50-100 minutes of analysis time
- Analyzing during import would make imports extremely slow

**Current Workflow (Recommended):**
1. **Import all your games** (fast - just fetches metadata)
2. **Analyze games selectively**:
   - Recent games you want to review
   - Important tournament games
   - Games where you want to understand your mistakes
3. **Bulk analyze** when you have time (optional feature coming soon)

### Move Classifications

- **Best Move (!!)** - The engine's top choice (< 10 cp loss)
- **Excellent (!)** - Very close to best (10-25 cp loss)
- **Good** - Reasonable move (25-50 cp loss)
- **Inaccuracy (?!)** - Slight mistake (50-100 cp loss)
- **Mistake (?)** - Significant error (100-200 cp loss)
- **Blunder (??)** - Major error (> 200 cp loss)

### Accuracy Calculation

Accuracy = 100 - (average_centipawn_loss / 10)

- 95-100%: Excellent play
- 85-95%: Very good
- 75-85%: Good
- 65-75%: Average
- < 65%: Needs improvement

## Using the Analysis Features

### Game Viewer

**Once a game is analyzed**, you can:
1. Navigate to any game from the Games page
2. Use the controls to step through moves
3. Click on any move in the move list to jump to that position
4. See evaluation bars and move annotations
5. Review suggested improvements

### Statistics

Your statistics update automatically as more games are analyzed:
- **Average accuracy** across all analyzed games
- **Error counts** (blunders, mistakes, inaccuracies)
- **Average centipawn loss**

### Opening Analysis

Opening statistics show:
- **Win rates by opening** (from all games, analyzed or not)
- **Average accuracy by opening** (only from analyzed games)
- This helps you identify which openings you play well vs poorly

## Tips for Best Results

1. **Start with recent games** - Analyze your latest 10-20 games first
2. **Focus on losses** - Learn more from analyzing games you lost
3. **Review annotations** - Pay attention to moves marked with ?! and ??
4. **Compare with best moves** - See what the engine recommended instead
5. **Track patterns** - Notice if you make similar mistakes in similar positions

## Planned Features

- **Bulk analysis queue** - Analyze multiple games automatically
- **Critical positions** - Highlight turning points in games
- **Opening preparation** - Common positions in your openings
- **Opponent analysis** - Track patterns in opponents' play
- **Progress tracking** - See how your accuracy improves over time

## Technical Details

- **Engine**: Stockfish (world's strongest chess engine)
- **Depth**: 20 ply (about 10 full moves of calculation)
- **Time per position**: ~1 second
- **Storage**: All analysis is saved to the database for instant replay

## Troubleshooting

**Game viewer shows no moves?**
- The game hasn't been analyzed yet
- Click "Analyze" on the game in the Games page
- Wait 30-60 seconds for analysis to complete
- Refresh and try again

**Analysis taking too long?**
- This is normal for games with many moves (50+ moves)
- The system analyzes every position
- Be patient - quality analysis takes time

**Accuracy shows N/A?**
- No games have been analyzed yet
- Analyze some games first
- Statistics will update automatically

## Need Help?

If you encounter issues:
1. Check that Stockfish is installed (should be automatic in Docker)
2. Look for error messages in the import/analysis feedback
3. Try analyzing a single short game first to test
4. Check the backend logs for detailed error information

---

Remember: Analysis is powerful but time-consuming. Start small, analyze strategically, and use the insights to improve your chess!

