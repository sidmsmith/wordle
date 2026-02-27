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

async function ablyPublish(channel, eventName, data) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return;
  try {
    await fetch(`https://rest.ably.io/channels/${encodeURIComponent(channel)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(key).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: eventName, data: JSON.stringify(data) }),
    });
  } catch (_) {}
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const client = await getPool().connect();
  try {
    // Ensure table exists (idempotent).
    await client.query(`
      CREATE TABLE IF NOT EXISTS multiplayer_lobby (
        username VARCHAR(64) PRIMARY KEY,
        last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    if (req.method === "POST") {
      const { username } = req.body || {};
      if (!username) return res.status(400).json({ error: "username required" });
      const u = username.toLowerCase();

      await client.query(
        `INSERT INTO multiplayer_lobby (username, last_seen)
         VALUES ($1, NOW())
         ON CONFLICT (username) DO UPDATE SET last_seen = NOW()`,
        [u]
      );

      // Notify all lobby subscribers that the player list changed.
      await ablyPublish("wordle-lobby", "lobby-update", { username: u });

      return res.status(200).json({ ok: true });
    }

    if (req.method === "GET") {
      // Return all known users with status:
      //   available = recent heartbeat (last 15s) — in lobby or solo game
      //   playing   = currently in an active multiplayer room
      //   offline   = not seen recently
      const { rows } = await client.query(`
        SELECT
          u.username,
          CASE
            WHEN mp.username IS NOT NULL THEN 'playing'
            WHEN l.last_seen > NOW() - INTERVAL '15 seconds' THEN 'available'
            ELSE 'offline'
          END AS status
        FROM (
          SELECT DISTINCT LOWER(username) AS username
          FROM wordle_games
          WHERE username IS NOT NULL AND username <> ''
          UNION
          SELECT username FROM multiplayer_lobby
        ) u
        LEFT JOIN multiplayer_lobby l ON l.username = u.username
        LEFT JOIN (
          SELECT DISTINCT mp.username
          FROM multiplayer_players mp
          JOIN multiplayer_rooms mr ON mr.id = mp.room_id
          WHERE mr.status = 'active' AND mp.status = 'playing'
        ) mp ON mp.username = u.username
        ORDER BY
          CASE
            WHEN l.last_seen > NOW() - INTERVAL '15 seconds' THEN 0
            WHEN mp.username IS NOT NULL THEN 1
            ELSE 2
          END,
          u.username ASC
      `);
      return res.status(200).json({ players: rows });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } finally {
    client.release();
  }
}
