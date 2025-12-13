import os
import pytest
from backend.app.services.coach_service import CoachService


def test_build_coaching_prompt_and_generation(monkeypatch):
    # Enable coach and set provider to Ollama for tests
    from backend.app import config

    config.settings.ENABLE_COACH = True
    config.settings.COACH_PROVIDER = "ollama"
    config.settings.OLLAMA_BASE_URL = "http://localhost:11434"
    config.settings.OLLAMA_MODEL = "llama3.1"

    service = CoachService()
    assert service.is_enabled()

    prompt = service._build_coaching_prompt(
        move_san="Nf3",
        classification="mistake",
        centipawn_loss=123.4,
        fen_before="rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2",
        best_move_san="Nc3",
        game_phase="opening",
        user_color="white",
    )

    assert "Move played: Nf3" in prompt
    assert "Centipawn loss: 123.4" in prompt

    # Mock Ollama request
    class FakeResponse:
        status_code = 200

        def json(self):
            return {"response": "Good move, but watch your development."}

    def fake_post(url, json, timeout):
        return FakeResponse()

    monkeypatch.setattr("requests.post", fake_post)

    import asyncio
+    commentary = asyncio.run(service.generate_move_commentary(
+        move_san="Nf3",
+        classification="mistake",
+        centipawn_loss=123.4,
+        fen_before="rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2",
+        fen_after="rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 3 2",
+        best_move_san="Nc3",
+        game_phase="opening",
+        user_color="white",
+    ))
+
+    assert commentary is not None
+    assert "Good move" in commentary
