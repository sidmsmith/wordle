import pg from "pg";

const { Pool } = pg;
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.NEON_DATABASE_URL;
    if (!connectionString) throw new Error("NEON_DATABASE_URL is required");
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

const TABLES = {
  wordle_games: {
    orderBy: "end_time DESC",
    cols: "id, start_time, end_time, target_word, outcome, guesses_count, guesses_json, remaining_counts_json, username, difficulty, created_at",
  },
  multiplayer_rooms: {
    orderBy: "created_at DESC",
    cols: "id, host_username, status, target_word, created_at, started_at, ended_at",
  },
  multiplayer_players: {
    orderBy: "id DESC",
    cols: "id, room_id, username, role, status, guesses_count, finished_at",
  },
  multiplayer_lobby: {
    orderBy: "last_seen DESC",
    cols: "username, last_seen, difficulty",
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const table = (req.query.table || "wordle_games").toLowerCase();
  if (!TABLES[table]) {
    return res.status(400).json({ error: "Invalid table" });
  }

  const { cols, orderBy } = TABLES[table];
  const client = await getPool().connect();

  try {
    const { rows } = await client.query(
      `SELECT ${cols} FROM ${table} ORDER BY ${orderBy}`
    );
    return res.status(200).json({ table, rows });
  } catch (e) {
    return res.status(500).json({ error: String(e.message) });
  } finally {
    client.release();
  }
}
