import pytest
from backend.app.services.stats_service import StatsService
from backend.app.models import User, Game, Move, UserStats
from datetime import datetime, timedelta


def test_calculate_user_stats_basic(db_session):
    # Create user
    user = User(email="u@example.com", username="user1", hashed_password="x", chess_com_username="user1")
    db_session.add(user)
    db_session.commit()

    # Create games for the user
    now = datetime.utcnow()
    games = []
    for i in range(5):
        g = Game(
            user_id=user.id,
            pgn="",
            white_player="user1",
            black_player="opponent",
            user_color="white",
            user_rating=1500,
            result="win" if i % 2 == 0 else "loss",
            date_played=now - timedelta(days=i),
            is_analyzed=True,
            average_centipawn_loss=10.0 + i,
            accuracy=90.0 - i,
            num_blunders=0,
            num_mistakes=1,
            num_inaccuracies=2,
        )
        db_session.add(g)
        db_session.flush()
        # add some moves
        for m_idx in range(3):
            mv = Move(
                game_id=g.id,
                move_number=m_idx + 1,
                is_white=True,
                half_move=m_idx,
                move_san="e4",
                move_uci="e2e4",
                classification="mistake" if m_idx == 1 else "good",
            )
            db_session.add(mv)

        games.append(g)

    db_session.commit()

    stats = StatsService.calculate_user_stats(db_session, user.id)
    assert stats["total_games"] == 5
    assert "avg_accuracy" in stats
    assert stats["total_mistakes"] >= 0
