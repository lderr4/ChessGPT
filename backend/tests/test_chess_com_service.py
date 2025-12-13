import pytest
from backend.app.services.chess_com_service import ChessComService


def test_parse_game_data_simple(sample_pgn):
    service = ChessComService()

    # Build a game_data dict similar to Chess.com API
    game_data = {
        "white": {"username": "Alice", "result": "win", "rating": 1500},
        "black": {"username": "Bob", "result": "resigned", "rating": 1400},
        "url": "https://www.chess.com/game/12345",
        "pgn": sample_pgn,
        "time_class": "rapid",
        "time_control": "600+0",
        "end_time": 1700000000,
    }

    parsed = service.parse_game_data(game_data, target_username="Alice")

    assert parsed is not None
    assert parsed["user_color"] == "white"
    assert parsed["white_player"] == "Alice"
    assert parsed["black_player"] == "Bob"
    assert parsed["opening_eco"] == "C50"
    assert parsed["opening_name"] == "Giuoco Piano"
