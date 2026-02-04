from sqlalchemy import inspect, text


def ensure_lichess_columns(engine) -> None:
    """Backfill Lichess columns for existing databases."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())

        if "users" in table_names:
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            if "lichess_username" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN lichess_username VARCHAR"))

        if "games" in table_names:
            game_columns = {column["name"] for column in inspector.get_columns("games")}
            if "lichess_url" not in game_columns:
                connection.execute(text("ALTER TABLE games ADD COLUMN lichess_url VARCHAR"))
            if "lichess_id" not in game_columns:
                connection.execute(text("ALTER TABLE games ADD COLUMN lichess_id VARCHAR"))

            # Indexes for Lichess lookups.
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_games_lichess_id "
                    "ON games(lichess_id) WHERE lichess_id IS NOT NULL"
                )
            )
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_games_user_lichess_id "
                    "ON games(user_id, lichess_id) WHERE lichess_id IS NOT NULL"
                )
            )


def ensure_puzzle_analysis_cache(engine) -> None:
    """Create puzzle_analysis_cache table if it doesn't exist."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "puzzle_analysis_cache" not in inspector.get_table_names():
            # Use dialect-appropriate syntax (PostgreSQL SERIAL vs SQLite INTEGER)
            dialect = engine.dialect.name
            if dialect == "sqlite":
                id_col = "id INTEGER PRIMARY KEY AUTOINCREMENT"
            else:
                id_col = "id SERIAL PRIMARY KEY"
            connection.execute(text(f"""
                CREATE TABLE puzzle_analysis_cache (
                    {id_col},
                    game_id INTEGER NOT NULL REFERENCES games(id),
                    move_id INTEGER NOT NULL REFERENCES moves(id),
                    solution_uci_list TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(game_id, move_id)
                )
            """))
            connection.execute(
                text("CREATE UNIQUE INDEX ix_puzzle_cache_game_move ON puzzle_analysis_cache(game_id, move_id)")
            )
