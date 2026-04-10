/**
 * Rewrites words7-supplement.txt by dropping 7-letter words that look like
 * regular plurals, using stems looked up in dwyl words_alpha (all lengths).
 *
 * Heuristics (conservative where stem must exist in words_alpha):
 *   - …y + ies  → …y  (berries → berry)
 *   - stem + es → stem (classes → class) when stem length ≥ 3
 *   - stem + s  → stem when stem is exactly 6 letters (oranges → orange)
 *
 * Irregular plurals (geese, children) are not removed. Some edge cases remain.
 * Run from wordle/: node scripts/filter-supplement-no-plurals.js
 */
import fs from "fs";
import https from "https";
import path from "path";

const root = process.cwd();
const supplementPath = path.join(root, "words7-supplement.txt");
const alphaUrl =
  "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "node" } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      })
      .on("error", reject);
  });
}

/** @param {string} w */
function looksLikeRegularPlural(w, byLen) {
  if (w.length !== 7) return false;

  if (w.endsWith("ies")) {
    const singularY = w.slice(0, -3) + "y";
    if (singularY.length >= 3 && byLen.get(singularY.length)?.has(singularY))
      return true;
  }

  if (w.endsWith("es")) {
    const stem = w.slice(0, -2);
    if (stem.length >= 3 && byLen.get(stem.length)?.has(stem)) return true;
  }

  if (w.endsWith("s") && !w.endsWith("ss")) {
    const stem = w.slice(0, -1);
    if (stem.length === 6 && byLen.get(6)?.has(stem)) return true;
  }

  return false;
}

async function main() {
  if (!fs.existsSync(supplementPath)) {
    console.error("Missing words7-supplement.txt");
    process.exit(1);
  }

  console.log("Fetching words_alpha for stem lookup…");
  const raw = await fetchText(alphaUrl);
  /** @type {Map<number, Set<string>>} */
  const byLen = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (!/^[a-z]+$/.test(w)) continue;
    if (!byLen.has(w.length)) byLen.set(w.length, new Set());
    byLen.get(w.length).add(w);
  }

  const lines = fs.readFileSync(supplementPath, "utf8").split(/\r?\n/);
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    const w = line.trim().toLowerCase();
    if (!/^[a-z]{7}$/.test(w)) continue;
    if (looksLikeRegularPlural(w, byLen)) {
      removed++;
      continue;
    }
    kept.push(w);
  }

  kept.sort();
  const unique = [...new Set(kept)];
  fs.writeFileSync(supplementPath, unique.join("\n") + "\n", "utf8");
  console.log(
    `words7-supplement.txt: removed ~plural ${removed}, kept ${unique.length} words`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
