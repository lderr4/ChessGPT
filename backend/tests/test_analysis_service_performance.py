"""
Performance tests for AnalysisService

Run with: pytest tests/test_analysis_service_performance.py -v -s

These tests measure the performance of key functions to track improvements.
"""
import pytest
import time
import asyncio
import chess

try:
    from app.services.analysis_service import AnalysisService
except ImportError:
    # Fallback for local development
    from backend.app.services.analysis_service import AnalysisService


# Sample PGN games of different lengths for testing
SHORT_GAME_PGN = """[Event "Test"]
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

MEDIUM_GAME_PGN = """[Event "Test"]
[Site "Local"]
[Date "2025.12.13"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6 20. Nbd2 Nxd6 21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7 25. Nxf7 Rxe1+ 26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6 30. a3 Kd6 31. axb4 cxb4 32. Ra5 Nd5 33. f3 Bc8 34. Kf2 Bf5 35. Ra7 g6 36. Ra6+ Kc5 37. Ke1 Nf4 38. g3 Nxh3 39. Kd2 Kb5 40. Rd6 Kc5 41. Ra6 Nf2 42. g4 Bd3 43. Re6 1-0
"""

LONG_GAME_PGN = """[Event "Test"]
[Site "Local"]
[Date "2025.12.13"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1/2-1/2"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6 20. Nbd2 Nxd6 21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7 25. Nxf7 Rxe1+ 26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6 30. a3 Kd6 31. axb4 cxb4 32. Ra5 Nd5 33. f3 Bc8 34. Kf2 Bf5 35. Ra7 g6 36. Ra6+ Kc5 37. Ke1 Nf4 38. g3 Nxh3 39. Kd2 Kb5 40. Rd6 Kc5 41. Ra6 Nf2 42. g4 Bd3 43. Re6 Kd5 44. Rb6 Kc5 45. Ra6 Kd5 46. Rb6 Kc5 47. Ra6 Kd5 48. Rb6 Kc5 49. Ra6 Kd5 50. Rb6 Kc5 51. Ra6 Kd5 52. Rb6 Kc5 53. Ra6 Kd5 54. Rb6 Kc5 55. Ra6 Kd5 56. Rb6 Kc5 57. Ra6 Kd5 58. Rb6 Kc5 59. Ra6 Kd5 60. Rb6 Kc5 1/2-1/2
"""


class PerformanceTimer:
    """Helper class to measure and report performance metrics"""
    
    def __init__(self, name: str):
        self.name = name
        self.start_time = None
        self.end_time = None
        self.elapsed = None
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, *args):
        self.end_time = time.perf_counter()
        self.elapsed = self.end_time - self.start_time
    
    def get_elapsed(self) -> float:
        return self.elapsed if self.elapsed else time.perf_counter() - self.start_time


def count_moves(pgn: str) -> int:
    """Count the number of moves in a PGN"""
    service = AnalysisService()
    game = service.parse_pgn(pgn)
    if not game:
        return 0
    return len(list(game.mainline()))


@pytest.mark.asyncio
async def test_analyze_game_short_performance():
    """Test performance of analyze_game on a short game (~10 moves)"""
    service = AnalysisService()
    moves = count_moves(SHORT_GAME_PGN)
    
    print(f"\n{'='*60}")
    print(f"Testing SHORT GAME ({moves} moves)")
    print(f"{'='*60}")
    
    with PerformanceTimer("analyze_game (short)") as timer:
        result = await service.analyze_game(SHORT_GAME_PGN, "white")
    
    elapsed = timer.get_elapsed()
    moves_analyzed = len(result.get("moves", []))
    
    print(f"⏱️  Total time: {elapsed:.2f} seconds")
    print(f"📊 Moves analyzed: {moves_analyzed}")
    print(f"⚡ Time per move: {elapsed/moves_analyzed:.3f} seconds" if moves_analyzed > 0 else "N/A")
    print(f"✅ Success: {result.get('error') is None}")
    
    assert result.get("error") is None
    assert elapsed < 60  # Should complete in under 60 seconds
    assert moves_analyzed > 0


@pytest.mark.asyncio
async def test_analyze_game_medium_performance():
    """Test performance of analyze_game on a medium game (~40 moves)"""
    service = AnalysisService()
    moves = count_moves(MEDIUM_GAME_PGN)
    
    print(f"\n{'='*60}")
    print(f"Testing MEDIUM GAME ({moves} moves)")
    print(f"{'='*60}")
    
    with PerformanceTimer("analyze_game (medium)") as timer:
        result = await service.analyze_game(MEDIUM_GAME_PGN, "white")
    
    elapsed = timer.get_elapsed()
    moves_analyzed = len(result.get("moves", []))
    
    print(f"⏱️  Total time: {elapsed:.2f} seconds")
    print(f"📊 Moves analyzed: {moves_analyzed}")
    print(f"⚡ Time per move: {elapsed/moves_analyzed:.3f} seconds" if moves_analyzed > 0 else "N/A")
    print(f"✅ Success: {result.get('error') is None}")
    
    # Calculate expected engine calls (2 per move: before + after)
    expected_calls = moves_analyzed * 2
    print(f"🔍 Expected engine calls: ~{expected_calls} (2 per move)")
    
    assert result.get("error") is None
    assert moves_analyzed > 0


@pytest.mark.asyncio
async def test_analyze_game_long_performance():
    """Test performance of analyze_game on a long game (~60 moves)"""
    service = AnalysisService()
    moves = count_moves(LONG_GAME_PGN)
    
    print(f"\n{'='*60}")
    print(f"Testing LONG GAME ({moves} moves)")
    print(f"{'='*60}")
    
    with PerformanceTimer("analyze_game (long)") as timer:
        result = await service.analyze_game(LONG_GAME_PGN, "white")
    
    elapsed = timer.get_elapsed()
    moves_analyzed = len(result.get("moves", []))
    
    print(f"⏱️  Total time: {elapsed:.2f} seconds")
    print(f"📊 Moves analyzed: {moves_analyzed}")
    print(f"⚡ Time per move: {elapsed/moves_analyzed:.3f} seconds" if moves_analyzed > 0 else "N/A")
    print(f"✅ Success: {result.get('error') is None}")
    
    assert result.get("error") is None
    assert moves_analyzed > 0


def test_classify_move_performance():
    """Test performance of classify_move function (should be very fast)"""
    service = AnalysisService()
    
    print(f"\n{'='*60}")
    print(f"Testing classify_move performance")
    print(f"{'='*60}")
    
    test_cases = [
        (5, None, None, "best"),
        (40, None, None, "good"),
        (80, 0.2, 1.0, "inaccuracy"),
        (200, 2.6, 0.8, "mistake"),
        (350, 0.0, -3.5, "blunder"),
    ]
    
    with PerformanceTimer("classify_move (1000 calls)") as timer:
        for _ in range(1000):
            for cp_loss, eval_before, eval_after, expected in test_cases:
                result = service.classify_move(cp_loss, eval_before, eval_after)
                assert result == expected
    
    elapsed = timer.get_elapsed()
    calls = len(test_cases) * 1000
    
    print(f"⏱️  Total time: {elapsed:.4f} seconds")
    print(f"📊 Total calls: {calls}")
    print(f"⚡ Time per call: {(elapsed/calls)*1000000:.2f} microseconds")
    print(f"✅ Performance: {'EXCELLENT' if elapsed < 0.1 else 'GOOD' if elapsed < 1.0 else 'SLOW'}")


def test_parse_pgn_performance():
    """Test performance of parse_pgn function"""
    service = AnalysisService()
    
    print(f"\n{'='*60}")
    print(f"Testing parse_pgn performance")
    print(f"{'='*60}")
    
    with PerformanceTimer("parse_pgn (1000 calls)") as timer:
        for _ in range(1000):
            game = service.parse_pgn(MEDIUM_GAME_PGN)
            assert game is not None
    
    elapsed = timer.get_elapsed()
    
    print(f"⏱️  Total time: {elapsed:.4f} seconds")
    print(f"📊 Total calls: 1000")
    print(f"⚡ Time per call: {(elapsed/1000)*1000:.3f} milliseconds")
    print(f"✅ Performance: {'EXCELLENT' if elapsed < 1.0 else 'GOOD' if elapsed < 5.0 else 'SLOW'}")


@pytest.mark.asyncio
async def test_analyze_position_performance():
    """Test performance of analyze_position function"""
    service = AnalysisService()
    test_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    
    print(f"\n{'='*60}")
    print(f"Testing analyze_position performance")
    print(f"{'='*60}")
    
    with PerformanceTimer("analyze_position (single call)") as timer:
        result = await service.analyze_position(test_fen)
    
    elapsed = timer.get_elapsed()
    
    print(f"⏱️  Total time: {elapsed:.2f} seconds")
    print(f"✅ Success: {result.get('error') is None}")
    print(f"📊 Evaluation: {result.get('evaluation')}")
    print(f"🎯 Best move: {result.get('best_move_san')}")
    
    assert result.get("error") is None
    # Should complete in reasonable time based on STOCKFISH_TIME_LIMIT
    assert elapsed < 5.0


@pytest.mark.asyncio
async def test_analyze_game_breakdown():
    """Break down analyze_game into components to identify bottlenecks"""
    service = AnalysisService()
    
    print(f"\n{'='*60}")
    print(f"Performance Breakdown Analysis")
    print(f"{'='*60}")
    
    # Parse PGN
    with PerformanceTimer("parse_pgn") as timer:
        game = service.parse_pgn(SHORT_GAME_PGN)
    parse_time = timer.get_elapsed()
    print(f"📝 Parse PGN: {parse_time:.4f}s")
    
    # Build move list
    with PerformanceTimer("build_move_list") as timer:
        all_moves = []
        temp_board = game.board()
        for node in game.mainline():
            move = node.move
            is_white = temp_board.turn == chess.WHITE
            san = temp_board.san(move)
            all_moves.append({
                'move': move,
                'is_white': is_white,
                'san': san
            })
            temp_board.push(move)
    build_time = timer.get_elapsed()
    print(f"📋 Build move list: {build_time:.4f}s")
    
    # Full analysis
    with PerformanceTimer("full_analysis") as timer:
        result = await service.analyze_game(SHORT_GAME_PGN, "white")
    analysis_time = timer.get_elapsed()
    
    print(f"🔍 Full analysis: {analysis_time:.2f}s")
    print(f"📊 Moves: {len(result.get('moves', []))}")
    print(f"\n💡 Breakdown:")
    print(f"   - Setup overhead: {parse_time + build_time:.4f}s ({((parse_time + build_time)/analysis_time)*100:.1f}%)")
    print(f"   - Engine analysis: {analysis_time - parse_time - build_time:.2f}s ({((analysis_time - parse_time - build_time)/analysis_time)*100:.1f}%)")
    
    assert result.get("error") is None


if __name__ == "__main__":
    # Run with: python -m pytest tests/test_analysis_service_performance.py -v -s
    pytest.main([__file__, "-v", "-s"])

