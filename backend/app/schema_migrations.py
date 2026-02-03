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
