-- Migration: Add analysis_state field to games table
-- This field tracks the current state of game analysis: 'unanalyzed', 'in_progress', or 'analyzed'

-- Add the analysis_state column with default value 'unanalyzed'
ALTER TABLE games ADD COLUMN analysis_state VARCHAR(20) NOT NULL DEFAULT 'unanalyzed';

-- Update existing games: if is_analyzed is true, set analysis_state to 'analyzed', otherwise 'unanalyzed'
UPDATE games SET analysis_state = CASE 
    WHEN is_analyzed = true THEN 'analyzed'
    ELSE 'unanalyzed'
END;

-- Create an index on analysis_state for faster queries
CREATE INDEX IF NOT EXISTS ix_games_analysis_state ON games(analysis_state);
