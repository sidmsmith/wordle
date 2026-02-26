/**
 * Backfill remaining_counts_json for games that have NULL in that column.
 *
 * This script is safe to run at any time – it only touches rows where
 * remaining_counts_json IS NULL and skips any already populated rows.
 *
 * Prerequisites:
 *   1. Create a .env.local file in the wordle/ directory with:
 *        NEON_DATABASE_URL=<your connection string>
 *      (get it from Vercel: Settings → Environment Variables)
 *   2. npm install pg dotenv  (if not already installed)
 *
 * Run from the wordle/ directory:
 *   node scripts/backfill-remaining-counts.js
 */

import fs from "fs";
import path from "path";
import pg from "pg";

const { Pool } = pg;

// ── Load env (try .env.local, then .env) ────────────────────────────────────
for (const f of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), f);
  if (fs.existsSync(p)) {
    fs.readFileSync(p, "utf8").split("\n").forEach(line => {
      const [k, ...v] = line.split("=");
      if (k && v.length) process.env[k.trim()] = v.join("=").trim();
    });
    console.log(`Loaded env from ${f}`);
    break;
  }
}

const NEON_URL = process.env.NEON_DATABASE_URL;
if (!NEON_URL) {
  console.error("NEON_DATABASE_URL not set. Create a .env.local file – see script header.");
  process.exit(1);
}

// ── Extract WORDS from wordle.html ──────────────────────────────────────────
const html = fs.readFileSync(path.join(process.cwd(), "wordle.html"), "utf8");
const wordsMatch = html.match(/const WORDS=(\[[\s\S]*?\]);/);
if (!wordsMatch) throw new Error("Could not parse WORDS array from wordle.html");
const WORDS = JSON.parse(wordsMatch[1].replace(/'/g, '"'));
const WORD_LENGTH = 5;
console.log(`Loaded ${WORDS.length} words from wordle.html`);

// ── Tile-state + filter logic (mirrors the game exactly) ────────────────────
function getTileState(guess, target) {
  const states = Array(WORD_LENGTH).fill("absent");
  const targetCounts = {}, guessCounts = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) states[i] = "correct";
    targetCounts[target[i]] = (targetCounts[target[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (states[i] === "correct") guessCounts[guess[i]] = (guessCounts[guess[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (states[i] !== "correct") {
      const c = guess[i];
      if (target.includes(c) && (guessCounts[c] || 0) < (targetCounts[c] || 0)) {
        states[i] = "present";
        guessCounts[c] = (guessCounts[c] || 0) + 1;
      }
    }
  }
  return states;
}

function getRemainingWords(guessHistory) {
  if (!guessHistory.length) return WORDS.slice();
  return WORDS.filter(word => {
    for (const { guess, states } of guessHistory) {
      const minCounts = {}, hasAbsent = {};
      for (let i = 0; i < WORD_LENGTH; i++) {
        const c = guess[i];
        if (states[i] === "correct" || states[i] === "present") {
          minCounts[c] = (minCounts[c] || 0) + 1;
        } else {
          hasAbsent[c] = true;
        }
      }
      for (const c of new Set(guess)) {
        const min = minCounts[c] || 0;
        const cnt = word.split("").filter(l => l === c).length;
        if (cnt < min) return false;
        if (hasAbsent[c] && cnt > min) return false;
      }
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (states[i] === "correct" && word[i] !== guess[i]) return false;
        if (states[i] === "present" && word[i] === guess[i]) return false;
      }
    }
    return true;
  });
}

// ── Main backfill ────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });

try {
  const { rows } = await pool.query(
    `SELECT id, target_word, guesses_json
     FROM wordle_games
     WHERE remaining_counts_json IS NULL
     ORDER BY id`
  );

  if (!rows.length) {
    console.log("No rows need backfilling – all games already have remaining_counts_json.");
    process.exit(0);
  }

  console.log(`Backfilling ${rows.length} games...`);

  for (const row of rows) {
    const history = [];
    const counts = [];
    for (const guess of row.guesses_json) {
      const states = getTileState(guess, row.target_word);
      history.push({ guess, states });
      counts.push(getRemainingWords(history).length);
    }
    await pool.query(
      `UPDATE wordle_games SET remaining_counts_json = $1 WHERE id = $2`,
      [JSON.stringify(counts), row.id]
    );
    console.log(`  id=${row.id}  ${row.target_word}  counts=${JSON.stringify(counts)}`);
  }

  console.log("Backfill complete.");
} finally {
  await pool.end();
}
