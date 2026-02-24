CREATE TABLE IF NOT EXISTS wordle_games (
    id BIGSERIAL PRIMARY KEY,
    client_game_id VARCHAR(128) UNIQUE NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    target_word VARCHAR(16) NOT NULL,
    outcome VARCHAR(16) NOT NULL,
    guesses_count INTEGER NOT NULL,
    guesses_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wordle_games_device_id
    ON wordle_games(device_id);

CREATE INDEX IF NOT EXISTS idx_wordle_games_end_time
    ON wordle_games(end_time DESC);
