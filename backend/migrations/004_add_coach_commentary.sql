-- Add coach_commentary column to moves table
-- This will store AI-generated coaching commentary for key moves

ALTER TABLE moves ADD COLUMN coach_commentary TEXT;

-- Add index for faster queries on moves with commentary
CREATE INDEX idx_moves_with_commentary ON moves (game_id) WHERE coach_commentary IS NOT NULL;

