import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set test environment before importing app modules that load settings
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CHESS_COM_USER_AGENT", "ChessAnalyticsTest/1.0")
os.environ.setdefault("STOCKFISH_PATH", "/usr/bin/false")

from backend.app.database import Base


@pytest.fixture(scope="session")
def engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db_session(engine):
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def sample_pgn():
    return (
        """[Event \"Test\"]\n[Site \"Local\"]\n[Date \"2025.12.13\"]\n[Round \"1\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[ECO \"C50\"]\n[Opening \"Giuoco Piano\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 0-1\n"""
    )
