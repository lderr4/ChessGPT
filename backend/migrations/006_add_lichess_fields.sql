-- Migration: Add Lichess.org integration fields
-- Date: 2024

-- Add lichess_username to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS lichess_username VARCHAR;

-- Add lichess_url and lichess_id to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS lichess_url VARCHAR;
ALTER TABLE games ADD COLUMN IF NOT EXISTS lichess_id VARCHAR;

-- Create unique index on lichess_id (similar to chess_com_id)
CREATE UNIQUE INDEX IF NOT EXISTS ix_games_lichess_id ON games(lichess_id) WHERE lichess_id IS NOT NULL;

-- Create index on lichess_id for faster lookups
CREATE INDEX IF NOT EXISTS ix_games_user_lichess_id ON games(user_id, lichess_id) WHERE lichess_id IS NOT NULL;
