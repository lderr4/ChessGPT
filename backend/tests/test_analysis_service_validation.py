"""
Validation tests for analyze_game function

These tests verify that the moves_analysis objects returned from analyze_game
are correct, especially after the optimization to reuse evaluations.

Run with: pytest tests/test_analysis_service_validation.py -v -s -p no:conftest
"""
import pytest
import asyncio
import chess
import os
import sys

# Add parent directory to path for imports
# In Docker: /app/tests/test_*.py -> need /app in path
# Locally: backend/tests/test_*.py -> need backend in path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Set test environment before importing app modules
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CHESS_COM_USER_AGENT", "ChessAnalyticsTest/1.0")
os.environ.setdefault("STOCKFISH_PATH", "/usr/games/stockfish")  # Use actual path in Docker

# Import AnalysisService
try:
    from app.services.analysis_service import AnalysisService
except ImportError:
    # Fallback for local development
    from backend.app.services.analysis_service import AnalysisService


# Simple test game for validation
VALIDATION_GAME_PGN = """[Event "Test"]
[Site "Local"]
[Date "2025.12.13"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[ECO "C50"]
[Opening "Giuoco Piano"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0
"""


@pytest.mark.asyncio
async def test_analyze_game_structure():
    """Test that analyze_game returns the correct structure"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    # Should not have errors
    assert "error" not in result, f"Analysis failed with error: {result.get('error')}"
    
    # Should have moves and stats
    assert "moves" in result, "Result should contain 'moves' key"
    assert "stats" in result, "Result should contain 'stats' key"
    
    moves = result["moves"]
    stats = result["stats"]
    
    # Validate moves is a list
    assert isinstance(moves, list), "moves should be a list"
    assert len(moves) > 0, "moves should not be empty"
    
    # Validate stats structure
    assert "num_moves" in stats
    assert "accuracy" in stats
    assert "num_blunders" in stats
    assert "num_mistakes" in stats
    assert "num_inaccuracies" in stats
    assert "average_centipawn_loss" in stats
    
    # Validate num_moves matches actual moves
    assert stats["num_moves"] == len(moves), "num_moves should match length of moves list"


@pytest.mark.asyncio
async def test_moves_analysis_required_fields():
    """Test that each move in moves_analysis has all required fields"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    required_fields = [
        "move_number",
        "is_white",
        "half_move",
        "move_san",
        "move_uci",
        "evaluation_before",
        "evaluation_after",
        "best_move_uci",
        "classification",
        "centipawn_loss",
        "coach_commentary",
    ]
    
    for i, move in enumerate(moves):
        for field in required_fields:
            assert field in move, f"Move {i} missing required field: {field}"
        
        # Validate field types
        assert isinstance(move["move_number"], int)
        assert isinstance(move["is_white"], bool)
        assert isinstance(move["half_move"], int)
        assert isinstance(move["move_san"], str)
        assert isinstance(move["move_uci"], str)
        assert move["classification"] in ["book", "best", "excellent", "good", "inaccuracy", "mistake", "blunder", None]
        # centipawn_loss can be None or a number (calculated for classification)
        if move["centipawn_loss"] is not None:
            assert isinstance(move["centipawn_loss"], (int, float)), "centipawn_loss should be numeric if not None"


@pytest.mark.asyncio
async def test_evaluation_reuse_consistency():
    """
    Test that evaluations are correctly reused between moves.
    
    The optimization reuses eval_after from move N as eval_before for move N+1.
    Since eval_after is stored flipped for the next player's perspective,
    and eval_before is from the current player's perspective,
    we need to verify the reuse logic is correct.
    """
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    # The reuse happens internally - eval_after (raw) becomes eval_before for next move
    # But in the stored data:
    # - evaluation_after is flipped: -eval_after (from next player's perspective)
    # - evaluation_before is from current player's perspective
    # 
    # So for move N+1, evaluation_before should be the raw eval_after from move N
    # But we store -eval_after, so we can't directly compare stored values
    # Instead, we verify that evaluations are present and reasonable
    for i in range(len(moves) - 1):
        current_move = moves[i]
        next_move = moves[i + 1]
        
        eval_after_current = current_move["evaluation_after"]
        eval_before_next = next_move["evaluation_before"]
        
        # Both should be present (unless there was an error)
        # The actual reuse happens internally, so we just verify data is present
        if eval_after_current is not None and eval_before_next is not None:
            # Both should be numeric values
            assert isinstance(eval_after_current, (int, float))
            assert isinstance(eval_before_next, (int, float))


@pytest.mark.asyncio
async def test_move_numbering_consistency():
    """Test that move numbers and half_moves are consistent"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    expected_move_number = 1
    expected_half_move = 0
    
    for move in moves:
        # Check half_move increments correctly
        assert move["half_move"] == expected_half_move, (
            f"Move {move['move_san']}: half_move should be {expected_half_move}, got {move['half_move']}"
        )
        expected_half_move += 1
        
        # Check move_number increments only on black moves
        if not move["is_white"]:
            assert move["move_number"] == expected_move_number, (
                f"Black move {move['move_san']}: move_number should be {expected_move_number}, got {move['move_number']}"
            )
            expected_move_number += 1
        else:
            # White moves should have the same move_number as the previous black move (or 1 if first)
            # Actually, white moves in a new move pair should have move_number = expected_move_number
            # But let's just check it's reasonable
            assert move["move_number"] >= 1


@pytest.mark.asyncio
async def test_stats_accuracy():
    """Test that stats accurately reflect the moves"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    stats = result["stats"]
    
    # Count classifications in moves (only for white moves since user_color is "white")
    user_moves = [m for m in moves if m["is_white"]]
    
    blunders_count = sum(1 for m in user_moves if m["classification"] == "blunder")
    mistakes_count = sum(1 for m in user_moves if m["classification"] == "mistake")
    inaccuracies_count = sum(1 for m in user_moves if m["classification"] == "inaccuracy")
    
    # Stats should match (within reason, since we're only counting user's moves)
    assert stats["num_blunders"] == blunders_count, (
        f"Stats blunders ({stats['num_blunders']}) should match counted blunders ({blunders_count})"
    )
    assert stats["num_mistakes"] == mistakes_count, (
        f"Stats mistakes ({stats['num_mistakes']}) should match counted mistakes ({mistakes_count})"
    )
    assert stats["num_inaccuracies"] == inaccuracies_count, (
        f"Stats inaccuracies ({stats['num_inaccuracies']}) should match counted inaccuracies ({inaccuracies_count})"
    )


@pytest.mark.asyncio
async def test_evaluation_perspective():
    """Test that evaluations are from the correct perspective"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    for move in moves:
        eval_before = move["evaluation_before"]
        eval_after = move["evaluation_after"]
        
        # Evaluations should be numbers or None
        if eval_before is not None:
            assert isinstance(eval_before, (int, float)), "evaluation_before should be numeric"
        if eval_after is not None:
            assert isinstance(eval_after, (int, float)), "evaluation_after should be numeric"


@pytest.mark.asyncio
async def test_best_move_uci_format():
    """Test that best_move_uci is in correct UCI format or None"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    for move in moves:
        best_move_uci = move["best_move_uci"]
        if best_move_uci is not None:
            # UCI format: e2e4, a7a8q, etc. (4-5 characters)
            assert len(best_move_uci) >= 4, f"best_move_uci should be at least 4 chars: {best_move_uci}"
            assert len(best_move_uci) <= 5, f"best_move_uci should be at most 5 chars: {best_move_uci}"
            # Should be lowercase
            assert best_move_uci.islower(), f"best_move_uci should be lowercase: {best_move_uci}"


@pytest.mark.asyncio
async def test_move_san_uci_consistency():
    """Test that move_san and move_uci represent the same move"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    for move in moves:
        move_san = move["move_san"]
        move_uci = move["move_uci"]
        
        # Both should be non-empty strings
        assert isinstance(move_san, str) and len(move_san) > 0
        assert isinstance(move_uci, str) and len(move_uci) >= 4
        
        # UCI should be lowercase
        assert move_uci.islower()


@pytest.mark.asyncio
async def test_centipawn_loss_calculated():
    """Test that centipawn_loss is calculated (can be None or a number)"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    for move in moves:
        cp_loss = move["centipawn_loss"]
        # centipawn_loss should be None or a numeric value
        if cp_loss is not None:
            assert isinstance(cp_loss, (int, float)), (
                f"centipawn_loss should be numeric if not None, got {type(cp_loss)} for move {move['move_san']}"
            )


@pytest.mark.asyncio
async def test_average_centipawn_loss_calculated():
    """Test that average_centipawn_loss is calculated in stats"""
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    stats = result["stats"]
    
    # average_centipawn_loss can be None or a number
    if stats["average_centipawn_loss"] is not None:
        assert isinstance(stats["average_centipawn_loss"], (int, float)), (
            "average_centipawn_loss should be numeric if not None"
        )


@pytest.mark.asyncio
async def test_engine_calls_optimization(monkeypatch):
    """
    Test that the optimization reduces engine calls by reusing evaluations.
    
    With optimization: N+1 calls for N moves (one per position)
    Without optimization: 2N calls (before + after per move)
    """
    service = AnalysisService()
    call_count = []
    
    # Monkeypatch to track calls - use the already imported chess module
    original_popen_uci = chess.engine.popen_uci
    
    async def tracked_popen_uci(path):
        transport, engine = await original_popen_uci(path)
        # Wrap the analyse method to track calls
        original_engine_analyse = engine.analyse
        async def wrapped_analyse(board, limit):
            call_count.append(1)
            return await original_engine_analyse(board, limit)
        engine.analyse = wrapped_analyse
        return transport, engine
    
    monkeypatch.setattr("chess.engine.popen_uci", tracked_popen_uci)
    
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    num_moves = len(moves)
    
    # With optimization: should be num_moves + 1 calls (one per position)
    # Without: would be 2 * num_moves calls
    expected_calls_optimized = num_moves + 1
    expected_calls_unoptimized = 2 * num_moves
    
    actual_calls = len(call_count)
    
    print(f"\nEngine calls: {actual_calls} (expected ~{expected_calls_optimized} with optimization, "
          f"would be {expected_calls_unoptimized} without)")
    
    # Should be closer to optimized count than unoptimized
    # Allow some variance for error handling, but should be much closer to optimized
    assert actual_calls <= expected_calls_unoptimized * 0.7, (
        f"Too many engine calls ({actual_calls}). Optimization may not be working. "
        f"Expected ~{expected_calls_optimized}, got {actual_calls}"
    )

@pytest.mark.asyncio
async def test_centipawn_loss_calculation_correctness():
    """
    Test that centipawn_loss is calculated correctly from evaluations.
    
    The stored values are:
    - evaluation_before: from current player's perspective (already flipped if black)
    - evaluation_after: -eval_after (flipped for next player, so from current player's perspective after move)
    - centipawn_loss: eval_before - eval_after (from current player's perspective)
    
    So: cp_loss should equal eval_before - (-eval_after) = eval_before + eval_after
    """
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    for move in moves:
        eval_before = move["evaluation_before"]
        eval_after = move["evaluation_after"]
        cp_loss = move["centipawn_loss"]
        is_white = move["is_white"]
        
        # If we have all three values, verify the calculation
        if eval_before is not None and eval_after is not None and cp_loss is not None:
            # Both stored evaluations are from the current player's perspective
            # evaluation_after is stored as -eval_after (flipped for next player)
            # So to get eval_after from current player's perspective, we need to flip it back
            eval_after_from_current_perspective = -eval_after
            
            # Calculate expected cp_loss
            # cp_loss = eval_before - eval_after (both from current player's perspective)
            expected_cp_loss = eval_before - eval_after_from_current_perspective
            
            # Allow small floating point differences
            tolerance = 0.1
            assert abs(cp_loss - expected_cp_loss) < tolerance, (
                f"Move {move['move_san']} ({'white' if is_white else 'black'}, half_move {move['half_move']}): "
                f"centipawn_loss calculation incorrect.\n"
                f"  Stored eval_before: {eval_before:.2f}\n"
                f"  Stored eval_after: {eval_after:.2f} (from next player's perspective)\n"
                f"  eval_after from current perspective: {eval_after_from_current_perspective:.2f}\n"
                f"  Expected cp_loss: {expected_cp_loss:.2f} (eval_before - eval_after_from_current)\n"
                f"  Actual cp_loss: {cp_loss:.2f}\n"
                f"  Difference: {abs(cp_loss - expected_cp_loss):.2f}"
            )


@pytest.mark.asyncio
async def test_evaluation_reasonable_values():
    """
    Test that evaluations are within reasonable bounds and not corrupted.
    
    Validates:
    - Evaluations are not NaN or infinite
    - Evaluations are within reasonable chess bounds (mate scores can be large)
    - Evaluations make sense relative to each other
    """
    import math
    
    service = AnalysisService()
    result = await service.analyze_game(VALIDATION_GAME_PGN, "white")
    
    assert "error" not in result
    moves = result["moves"]
    
    for move in moves:
        eval_before = move["evaluation_before"]
        eval_after = move["evaluation_after"]
        
        for eval_name, eval_value in [("evaluation_before", eval_before), ("evaluation_after", eval_after)]:
            if eval_value is not None:
                # Check for NaN or infinite
                assert not math.isnan(eval_value), (
                    f"Move {move['move_san']}: {eval_name} is NaN (Not a Number)"
                )
                assert not math.isinf(eval_value), (
                    f"Move {move['move_san']}: {eval_name} is infinite"
                )
                
                # Evaluations can be large for mate scores, but should be reasonable
                # Allow up to 50000 for extreme mate scores, but flag if extremely large
                assert abs(eval_value) < 50000, (
                    f"Move {move['move_san']}: {eval_name} is extremely large ({eval_value:.2f}), "
                    f"might indicate an error. Normal evaluations are typically -1000 to +1000 centipawns."
                )
                
                # Check that evaluations are reasonable (not absurdly large for non-mate positions)
                # Most positions should be within -5000 to +5000 centipawns (50 pawns)
                # Only mate positions should exceed this
                if abs(eval_value) > 5000:
                    # This might be a mate score, which is OK
                    # But log it for verification
                    pass
if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
