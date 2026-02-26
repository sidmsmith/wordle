import pg from "pg";

const { Pool } = pg;

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.NEON_DATABASE_URL;
    if (!connectionString) {
      throw new Error("NEON_DATABASE_URL environment variable is required");
    }

    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }
  return pool;
}

function normalizeGame(rawGame) {
  if (!rawGame || typeof rawGame !== "object") {
    return { error: "Game payload must be an object." };
  }

  const requiredFields = [
    "client_game_id",
    "device_id",
    "start_time",
    "end_time",
    "target_word",
    "outcome",
    "guesses"
  ];

  for (const field of requiredFields) {
    if (!(field in rawGame)) {
      return { error: `Missing required field: ${field}` };
    }
  }

  const outcome = String(rawGame.outcome).toLowerCase();
  if (outcome !== "win" && outcome !== "loss") {
    return { error: "outcome must be 'win' or 'loss'." };
  }

  if (!Array.isArray(rawGame.guesses)) {
    return { error: "guesses must be an array of lowercase words." };
  }

  const guesses = rawGame.guesses.map((guess) => String(guess).toLowerCase());
  const targetWord = String(rawGame.target_word).toLowerCase();

  // Optional: array of remaining possible-word counts after each guess.
  const remainingCounts = Array.isArray(rawGame.remaining_counts)
    ? rawGame.remaining_counts.map(Number).filter(n => !isNaN(n))
    : null;

  return {
    game: {
      client_game_id: String(rawGame.client_game_id),
      device_id: String(rawGame.device_id),
      start_time: new Date(rawGame.start_time),
      end_time: new Date(rawGame.end_time),
      target_word: targetWord,
      outcome,
      guesses_count: Number(rawGame.guesses_count || guesses.length),
      guesses,
      remaining_counts: remainingCounts
    }
  };
}

async function ensureTable(client) {
  await client.query(`
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
      remaining_counts_json JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Idempotent column addition for databases created before this column existed.
  await client.query(`
    ALTER TABLE wordle_games ADD COLUMN IF NOT EXISTS remaining_counts_json JSONB;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_wordle_games_device_id
    ON wordle_games(device_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_wordle_games_end_time
    ON wordle_games(end_time DESC);
  `);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const games = Array.isArray(req.body?.games) ? req.body.games : null;
  if (!games || games.length === 0) {
    return res.status(400).json({ error: "Request must include games array with at least one item." });
  }

  if (games.length > 100) {
    return res.status(400).json({ error: "Maximum batch size is 100 games." });
  }

  const dbPool = getPool();
  const client = await dbPool.connect();
  const acked_ids = [];
  const rejected = [];

  try {
    await ensureTable(client);
    await client.query("BEGIN");

    for (const gamePayload of games) {
      const { game, error } = normalizeGame(gamePayload);
      if (error) {
        rejected.push({
          client_game_id: gamePayload?.client_game_id || null,
          reason: error
        });
        continue;
      }

      const invalidDate =
        Number.isNaN(game.start_time.getTime()) || Number.isNaN(game.end_time.getTime());
      if (invalidDate) {
        rejected.push({
          client_game_id: game.client_game_id,
          reason: "Invalid start_time or end_time."
        });
        continue;
      }

      const remainingJson = game.remaining_counts
        ? JSON.stringify(game.remaining_counts)
        : null;

      await client.query(
        `
          INSERT INTO wordle_games (
            client_game_id,
            device_id,
            start_time,
            end_time,
            target_word,
            outcome,
            guesses_count,
            guesses_json,
            remaining_counts_json
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (client_game_id) DO UPDATE SET
            device_id = EXCLUDED.device_id,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            target_word = EXCLUDED.target_word,
            outcome = EXCLUDED.outcome,
            guesses_count = EXCLUDED.guesses_count,
            guesses_json = EXCLUDED.guesses_json,
            remaining_counts_json = COALESCE(EXCLUDED.remaining_counts_json, wordle_games.remaining_counts_json),
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          game.client_game_id,
          game.device_id,
          game.start_time,
          game.end_time,
          game.target_word,
          game.outcome,
          game.guesses_count,
          JSON.stringify(game.guesses),
          remainingJson
        ]
      );

      acked_ids.push(game.client_game_id);
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      received_count: games.length,
      accepted_count: acked_ids.length,
      rejected_count: rejected.length,
      acked_ids,
      rejected
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({
      success: false,
      error: "Failed to sync Wordle games.",
      message: error.message
    });
  } finally {
    client.release();
  }
}
