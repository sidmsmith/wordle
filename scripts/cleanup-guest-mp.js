import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  // Find all room IDs that had 'guest' as a participant.
  const { rows: guestRooms } = await client.query(
    `SELECT DISTINCT room_id FROM multiplayer_players WHERE LOWER(username) = 'guest'`
  );
  console.log(`Found ${guestRooms.length} rooms with guest participation.`);

  if (guestRooms.length > 0) {
    // Deleting from multiplayer_rooms cascades to multiplayer_players.
    const ids = guestRooms.map(r => r.room_id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    const { rowCount } = await client.query(
      `DELETE FROM multiplayer_rooms WHERE id IN (${placeholders})`,
      ids
    );
    console.log(`Deleted ${rowCount} room(s) (cascade removes player rows too).`);
  }

  // Also remove guest from the lobby heartbeat table.
  const { rowCount: lobbyRows } = await client.query(
    `DELETE FROM multiplayer_lobby WHERE LOWER(username) = 'guest'`
  );
  console.log(`Removed ${lobbyRows} guest row(s) from multiplayer_lobby.`);
} finally {
  client.release();
  await pool.end();
}
