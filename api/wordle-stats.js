import pg from "pg";

const { Pool } = pg;
let pool = null;

// Minimum number of games a starting word must appear in before it qualifies
// for Best / Worst First Word lists. Increase this as the game log grows.
const MIN_FIRST_WORD_GAMES = 3;

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

// Compute current and best win streak from an ordered array of outcome strings.
function computeStreaks(outcomes) {
  let best = 0, run = 0;
  for (const o of outcomes) {
    if (o === "win") { run++; if (run > best) best = run; }
    else run = 0;
  }
  let current = 0;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (outcomes[i] === "win") current++;
    else break;
  }
  return { currentStreak: current, bestStreak: best };
}

function processFirstWords(rows) {
  return rows.map(r => ({
    word: (r.first_word || "?").toLowerCase(),
    uses: Number(r.uses),
    avgRemaining: parseFloat(r.avg_remaining),
  }));
}

function processPpg(rows) {
  return rows.map(r => ({
    guessNum: Number(r.guess_num),
    avgRemaining: parseFloat(r.avg_remaining),
  }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { username = "" } = req.query;

  const client = await getPool().connect();
  try {
    // Run all queries in parallel for speed.
    const [
      meRes,
      overallDistRes,
      overallStartRes,
      overallStreakRes,
      meBestRes,
      meWorstRes,
      mePpgRes,
      overallBestRes,
      overallWorstRes,
      overallPpgRes,
    ] = await Promise.all([

      // 1. All games for this user (streak + distribution + top starters).
      client.query(
        `SELECT guesses_count, outcome, guesses_json->>0 AS first_word
         FROM wordle_games
         WHERE LOWER(username) = LOWER($1)
         ORDER BY end_time ASC`,
        [username]
      ),

      // 2. Aggregate counts for overall distribution.
      client.query(
        `SELECT guesses_count, outcome, COUNT(*) AS cnt
         FROM wordle_games
         GROUP BY guesses_count, outcome`
      ),

      // 3. Top 5 starting words across all games.
      client.query(
        `SELECT guesses_json->>0 AS first_word, COUNT(*) AS cnt
         FROM wordle_games
         GROUP BY guesses_json->>0
         ORDER BY COUNT(*) DESC
         LIMIT 5`
      ),

      // 4. All outcomes in chronological order for overall streak.
      client.query(
        `SELECT outcome FROM wordle_games ORDER BY end_time ASC`
      ),

      // 5. Me – best first words (lowest avg remaining = most eliminating).
      client.query(
        `SELECT guesses_json->>0 AS first_word,
                COUNT(*)::int AS uses,
                ROUND(AVG((remaining_counts_json->>0)::float)::numeric, 1) AS avg_remaining
         FROM wordle_games
         WHERE LOWER(username) = LOWER($1) AND remaining_counts_json IS NOT NULL
         GROUP BY guesses_json->>0
         HAVING COUNT(*) >= $2
         ORDER BY avg_remaining ASC
         LIMIT 5`,
        [username, MIN_FIRST_WORD_GAMES]
      ),

      // 6. Me – worst first words (highest avg remaining).
      client.query(
        `SELECT guesses_json->>0 AS first_word,
                COUNT(*)::int AS uses,
                ROUND(AVG((remaining_counts_json->>0)::float)::numeric, 1) AS avg_remaining
         FROM wordle_games
         WHERE LOWER(username) = LOWER($1) AND remaining_counts_json IS NOT NULL
         GROUP BY guesses_json->>0
         HAVING COUNT(*) >= $2
         ORDER BY avg_remaining DESC
         LIMIT 5`,
        [username, MIN_FIRST_WORD_GAMES]
      ),

      // 7. Me – average remaining possibilities at each guess number.
      client.query(
        `SELECT t.idx::int AS guess_num,
                ROUND(AVG(t.val::float)::numeric, 1) AS avg_remaining
         FROM wordle_games,
              jsonb_array_elements_text(remaining_counts_json) WITH ORDINALITY AS t(val, idx)
         WHERE LOWER(username) = LOWER($1) AND remaining_counts_json IS NOT NULL
         GROUP BY t.idx
         ORDER BY t.idx`,
        [username]
      ),

      // 8. Overall – best first words.
      client.query(
        `SELECT guesses_json->>0 AS first_word,
                COUNT(*)::int AS uses,
                ROUND(AVG((remaining_counts_json->>0)::float)::numeric, 1) AS avg_remaining
         FROM wordle_games
         WHERE remaining_counts_json IS NOT NULL
         GROUP BY guesses_json->>0
         HAVING COUNT(*) >= $1
         ORDER BY avg_remaining ASC
         LIMIT 5`,
        [MIN_FIRST_WORD_GAMES]
      ),

      // 9. Overall – worst first words.
      client.query(
        `SELECT guesses_json->>0 AS first_word,
                COUNT(*)::int AS uses,
                ROUND(AVG((remaining_counts_json->>0)::float)::numeric, 1) AS avg_remaining
         FROM wordle_games
         WHERE remaining_counts_json IS NOT NULL
         GROUP BY guesses_json->>0
         HAVING COUNT(*) >= $1
         ORDER BY avg_remaining DESC
         LIMIT 5`,
        [MIN_FIRST_WORD_GAMES]
      ),

      // 10. Overall – average remaining possibilities at each guess number.
      client.query(
        `SELECT t.idx::int AS guess_num,
                ROUND(AVG(t.val::float)::numeric, 1) AS avg_remaining
         FROM wordle_games,
              jsonb_array_elements_text(remaining_counts_json) WITH ORDINALITY AS t(val, idx)
         WHERE remaining_counts_json IS NOT NULL
         GROUP BY t.idx
         ORDER BY t.idx`
      ),
    ]);

    // ── "Me" stats ──────────────────────────────────────────────────────────
    const meRows = meRes.rows;
    const meTotal = meRows.length;
    const meWins  = meRows.filter(r => r.outcome === "win").length;
    const { currentStreak, bestStreak } = computeStreaks(meRows.map(r => r.outcome));

    const meDist = {};
    const meStartMap = {};
    for (const r of meRows) {
      if (r.outcome === "win") {
        const k = String(r.guesses_count);
        meDist[k] = (meDist[k] || 0) + 1;
      } else {
        meDist.loss = (meDist.loss || 0) + 1;
      }
      const w = (r.first_word || "?").toLowerCase();
      meStartMap[w] = (meStartMap[w] || 0) + 1;
    }

    const meTopStarters = Object.entries(meStartMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({
        word,
        count,
        pct: meTotal > 0 ? Math.round((count / meTotal) * 100) : 0,
      }));

    // ── "Overall" stats ─────────────────────────────────────────────────────
    let overallTotal = 0, overallWins = 0;
    const overallDist = {};
    for (const r of overallDistRes.rows) {
      const cnt = Number(r.cnt);
      overallTotal += cnt;
      if (r.outcome === "win") {
        overallWins += cnt;
        const k = String(r.guesses_count);
        overallDist[k] = (overallDist[k] || 0) + cnt;
      } else {
        overallDist.loss = (overallDist.loss || 0) + cnt;
      }
    }

    const overallTopStarters = overallStartRes.rows.map(r => ({
      word: (r.first_word || "?").toLowerCase(),
      count: Number(r.cnt),
      pct: overallTotal > 0 ? Math.round((Number(r.cnt) / overallTotal) * 100) : 0,
    }));

    const {
      currentStreak: overallCurrentStreak,
      bestStreak: overallBestStreak,
    } = computeStreaks(overallStreakRes.rows.map(r => r.outcome));

    return res.status(200).json({
      me: {
        totalGames: meTotal,
        wins: meWins,
        winPct: meTotal > 0 ? Math.round((meWins / meTotal) * 100) : 0,
        currentStreak,
        bestStreak,
        distribution: meDist,
        topStarters: meTopStarters,
        bestFirstWords: processFirstWords(meBestRes.rows),
        worstFirstWords: processFirstWords(meWorstRes.rows),
        possibilitiesPerGuess: processPpg(mePpgRes.rows),
      },
      overall: {
        totalGames: overallTotal,
        wins: overallWins,
        winPct: overallTotal > 0 ? Math.round((overallWins / overallTotal) * 100) : 0,
        currentStreak: overallCurrentStreak,
        bestStreak: overallBestStreak,
        distribution: overallDist,
        topStarters: overallTopStarters,
        bestFirstWords: processFirstWords(overallBestRes.rows),
        worstFirstWords: processFirstWords(overallWorstRes.rows),
        possibilitiesPerGuess: processPpg(overallPpgRes.rows),
      },
    });
  } finally {
    client.release();
  }
}
