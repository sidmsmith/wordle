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

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS multiplayer_rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      host_username VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'lobby',
      target_word VARCHAR(16),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP,
      ended_at TIMESTAMP
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS multiplayer_players (
      id BIGSERIAL PRIMARY KEY,
      room_id UUID REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
      username VARCHAR(64) NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'player',
      status VARCHAR(16) NOT NULL DEFAULT 'invited',
      guesses_count INTEGER,
      finished_at TIMESTAMP,
      UNIQUE(room_id, username)
    )
  `);
}

async function getRoomWithPlayers(client, roomId) {
  const { rows: roomRows } = await client.query(
    `SELECT * FROM multiplayer_rooms WHERE id = $1`,
    [roomId]
  );
  const { rows: players } = await client.query(
    `SELECT username, role, status, guesses_count, finished_at
     FROM multiplayer_players WHERE room_id = $1 ORDER BY role DESC, username ASC`,
    [roomId]
  );
  return { room: roomRows[0] || null, players };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const client = await getPool().connect();
  try {
    await ensureTables(client);

    // ── POST: create room ──────────────────────────────────────────────────
    if (req.method === "POST") {
      const { username, invitees = [] } = req.body || {};
      if (!username) return res.status(400).json({ error: "username required" });
      if (!invitees.length) return res.status(400).json({ error: "invitees required" });

      const host = username.toLowerCase();

      const { rows: [room] } = await client.query(
        `INSERT INTO multiplayer_rooms (host_username) VALUES ($1) RETURNING id`,
        [host]
      );
      const roomId = room.id;

      // Add host as accepted player.
      await client.query(
        `INSERT INTO multiplayer_players (room_id, username, role, status) VALUES ($1,$2,'host','accepted')`,
        [roomId, host]
      );

      // Add each invitee.
      for (const inv of invitees) {
        const invitee = inv.toLowerCase();
        await client.query(
          `INSERT INTO multiplayer_players (room_id, username, role, status) VALUES ($1,$2,'player','invited')
           ON CONFLICT (room_id, username) DO NOTHING`,
          [roomId, invitee]
        );
        // Notify invitee directly via the shared lobby channel.
        await ablyPublish("wordle-lobby", "invite", {
          invitee,
          host,
          room_id: roomId,
        });
      }

      return res.status(200).json({ room_id: roomId });
    }

    // ── GET: fetch room state ──────────────────────────────────────────────
    if (req.method === "GET") {
      const { room_id } = req.query;
      if (!room_id) return res.status(400).json({ error: "room_id required" });
      const { room, players } = await getRoomWithPlayers(client, room_id);
      if (!room) return res.status(404).json({ error: "room not found" });
      return res.status(200).json({ room, players });
    }

    // ── PATCH: room state transitions ──────────────────────────────────────
    if (req.method === "PATCH") {
      const { action, room_id, username } = req.body || {};
      if (!action || !room_id) return res.status(400).json({ error: "action and room_id required" });

      const user = username ? username.toLowerCase() : null;

      // accept ─────────────────────────────────────────────────────────────
      if (action === "accept") {
        await client.query(
          `UPDATE multiplayer_players SET status='accepted' WHERE room_id=$1 AND username=$2`,
          [room_id, user]
        );
        const { players } = await getRoomWithPlayers(client, room_id);
        await ablyPublish(`wordle-room-${room_id}`, "player-status", { players });
        return res.status(200).json({ ok: true });
      }

      // decline ────────────────────────────────────────────────────────────
      if (action === "decline") {
        await client.query(
          `UPDATE multiplayer_players SET status='declined' WHERE room_id=$1 AND username=$2`,
          [room_id, user]
        );
        const { players } = await getRoomWithPlayers(client, room_id);
        await ablyPublish(`wordle-room-${room_id}`, "player-status", { players });
        return res.status(200).json({ ok: true });
      }

      // start ──────────────────────────────────────────────────────────────
      if (action === "start") {
        const { target_word } = req.body;
        if (!target_word) return res.status(400).json({ error: "target_word required" });

        await client.query(
          `UPDATE multiplayer_rooms SET status='active', target_word=$2, started_at=NOW() WHERE id=$1`,
          [room_id, target_word.toLowerCase()]
        );
        await client.query(
          `UPDATE multiplayer_players SET status='playing' WHERE room_id=$1 AND status='accepted'`,
          [room_id]
        );
        await ablyPublish(`wordle-room-${room_id}`, "game-start", {
          target_word: target_word.toLowerCase(),
          room_id,
        });
        return res.status(200).json({ ok: true });
      }

      // win ────────────────────────────────────────────────────────────────
      if (action === "win") {
        const { guesses_count } = req.body;

        // Guard against duplicate win reports.
        const { rows: [room] } = await client.query(
          `SELECT status FROM multiplayer_rooms WHERE id=$1`,
          [room_id]
        );
        if (!room || room.status === "complete") {
          return res.status(200).json({ ok: true, already_won: true });
        }

        await client.query(
          `UPDATE multiplayer_players SET status='won', guesses_count=$3, finished_at=NOW()
           WHERE room_id=$1 AND username=$2`,
          [room_id, user, guesses_count]
        );
        await client.query(
          `UPDATE multiplayer_rooms SET status='complete', ended_at=NOW() WHERE id=$1`,
          [room_id]
        );

        const { rows: [roomData] } = await client.query(
          `SELECT target_word FROM multiplayer_rooms WHERE id=$1`,
          [room_id]
        );

        await ablyPublish(`wordle-room-${room_id}`, "player-won", {
          winner: user,
          target_word: roomData.target_word,
          guesses_count,
        });
        return res.status(200).json({ ok: true });
      }

      // abandon ────────────────────────────────────────────────────────────
      if (action === "abandon") {
        await client.query(
          `UPDATE multiplayer_rooms SET status='abandoned', ended_at=NOW() WHERE id=$1`,
          [room_id]
        );
        await ablyPublish(`wordle-room-${room_id}`, "room-abandoned", { room_id });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } finally {
    client.release();
  }
}
