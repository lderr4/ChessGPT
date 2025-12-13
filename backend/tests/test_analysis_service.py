import pytest
import chess
from backend.app.services.analysis_service import AnalysisService


def test_parse_pgn_and_detect_opening(sample_pgn):
    svc = AnalysisService()
    game = svc.parse_pgn(sample_pgn)
    assert game is not None
    eco, opening, ply = svc.detect_opening(sample_pgn)
    assert eco == "C50"
    assert opening == "Giuoco Piano"
    assert ply > 0


def test_classify_move_various_cases():
    svc = AnalysisService()
    # Near-perfect move
    assert svc.classify_move(5) == "best"
    # accuracy style
    assert svc.classify_move(40) == "good"
    # moderate inaccuracy
    assert svc.classify_move(80, eval_before=0.2, eval_after=1.0) == "inaccuracy"
    # massive loss -> blunder
    assert svc.classify_move(350, eval_before=0.0, eval_after=-3.5) == "blunder"
    # mistake by eval change
    assert svc.classify_move(200, eval_before=2.6, eval_after=0.8) == "mistake"


def test_get_evaluation_cp_cp_and_mate():
    svc = AnalysisService()

    class FakeScore:
        def __init__(self, cp=None, mate=None):
            self.relative = type("R", (), {})()
            self.relative.cp = cp
            self._mate = mate

        def is_mate(self):
            return self._mate is not None

        def mate(self):
            return self._mate

    class ScoreHolder:
        def __init__(self, score):
            self.score = score

        def get(self, key):
            if key == "score":
                return self.score
            return None

    info_cp = {"score": FakeScore(cp=123)}
    eval_cp = svc.get_evaluation_cp(info_cp)
    assert eval_cp == 123.0

    # Test mate evaluation
    fake_mate = type("X", (), {})()
    fake_mate.relative = type("R", (), {})()
    fake_mate.relative.mate = lambda: 2
    info_mate = {"score": FakeScore(cp=None, mate=2)}
    eval_mate = svc.get_evaluation_cp(info_mate)
    assert eval_mate is not None


def test_analyze_position_monkeypatched(monkeypatch):
    svc = AnalysisService()

    # Fake engine that returns a cp and pv
    class FakeScore:
        def __init__(self, cp=None, mate=None):
            self.relative = type("R", (), {})()
            self.relative.cp = cp
            self._mate = mate
            def mate_func():
                return self._mate
            # add a mate method on the nested object if mate is present
            self.relative.mate = mate_func
        def is_mate(self):
            return self._mate is not None

    class FakeEngine:
        def __init__(self):
            self._calls = 0

        async def analyse(self, board, limit):
            self._calls += 1
            return {"score": FakeScore(cp=100), "pv": [chess.Move.from_uci("e2e4")]} 

        async def quit(self):
            return

    async def fake_popen_uci(path):
        return (None, FakeEngine())

    monkeypatch.setattr("chess.engine.popen_uci", fake_popen_uci)

    import asyncio
+    result = asyncio.run(svc.analyze_position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"))
+    assert "evaluation" in result
+    assert "best_move" in result
