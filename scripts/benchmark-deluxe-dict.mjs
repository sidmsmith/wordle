/**
 * Benchmark Waffle Deluxe generation for an arbitrary 7-letter word list.
 * Usage: node scripts/benchmark-deluxe-dict.mjs <path>
 *   path: .txt (one word per line) or .json (JSON array of strings)
 * Env: CLOSURE_SAMPLES, TRIALS, MAX_T
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const dictPath = process.argv[2];
if (!dictPath) {
  console.error("Usage: node scripts/benchmark-deluxe-dict.mjs <words.txt|words.json>");
  process.exit(1);
}

const abs = path.isAbsolute(dictPath) ? dictPath : path.join(root, dictPath);
const raw = fs.readFileSync(abs, "utf8");
let WORDS = [];
if (abs.endsWith(".json")) {
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error("JSON must be an array");
  for (const x of arr) {
    const w = String(x).trim().toLowerCase();
    if (/^[a-z]{7}$/.test(w)) WORDS.push(w);
  }
} else {
  for (const line of raw.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (/^[a-z]{7}$/.test(w)) WORDS.push(w);
  }
}
WORDS = [...new Set(WORDS)];

const n = 7;
const axes = [0, 2, 4, 6];
const k = 4;

function isWaffleHoleNc(nr, ax, r, c) {
  return !ax.includes(r) && !ax.includes(c);
}

function buildPatternIndex(dict) {
  const index = new Map();
  for (const w of dict) {
    const key = axes.map((a) => w[a]).join("");
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(w);
  }
  return index;
}

function tryGenerate(maxT, dict, patIndex) {
  const pick = () => dict[Math.floor(Math.random() * dict.length)];
  for (let t = 0; t < maxT; t++) {
    const h = [];
    for (let i = 0; i < k; i++) h.push(pick());
    const v = [];
    let skip = false;
    for (let j = 0; j < k; j++) {
      const key = [0, 1, 2, 3].map((col) => h[col][axes[j]]).join("");
      const vopts = patIndex.get(key);
      if (!vopts || !vopts.length) {
        skip = true;
        break;
      }
      v.push(vopts[Math.floor(Math.random() * vopts.length)]);
    }
    if (skip) continue;
    const sol = Array.from({ length: n }, () => Array(n).fill(""));
    for (let i = 0; i < k; i++) for (let c = 0; c < n; c++) sol[axes[i]][c] = h[i][c];
    for (let j = 0; j < k; j++) for (let r = 0; r < n; r++) sol[r][axes[j]] = v[j][r];
    let ok = true;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (isWaffleHoleNc(n, axes, r, c)) continue;
        const ch = sol[r][c];
        if (axes.includes(r)) {
          if (h[axes.indexOf(r)][c] !== ch) ok = false;
        }
        if (axes.includes(c)) {
          if (v[axes.indexOf(c)][r] !== ch) ok = false;
        }
      }
    }
    if (!ok) continue;
    if (new Set([...h, ...v]).size !== 2 * k) continue;
    return t + 1;
  }
  return null;
}

const patIndex = buildPatternIndex(WORDS);
console.log(`Dictionary: ${abs}`);
console.log(`Seven-letter words (deduped): ${WORDS.length}`);

function measureColumnClosure(samples) {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  let ok = 0;
  for (let s = 0; s < samples; s++) {
    const h = [];
    for (let i = 0; i < k; i++) h.push(pick());
    let bad = false;
    for (let j = 0; j < k; j++) {
      const key = [0, 1, 2, 3].map((col) => h[col][axes[j]]).join("");
      if (!patIndex.get(key)?.length) {
        bad = true;
        break;
      }
    }
    if (!bad) ok++;
  }
  return { ok, samples };
}

const closureSamples = Number(process.env.CLOSURE_SAMPLES || 200_000);
const closure = measureColumnClosure(closureSamples);
console.log(
  `Column closure (all 4 vertical patterns exist): ${closure.ok} / ${closure.samples} random row quartets`
);

const trials = Number(process.env.TRIALS || 200);
const maxT = Number(process.env.MAX_T || 20000);
let successes = 0;
const innerTries = [];
const t0 = Date.now();

for (let i = 0; i < trials; i++) {
  const inner = tryGenerate(maxT, WORDS, patIndex);
  if (inner !== null) {
    successes++;
    innerTries.push(inner);
  }
}

innerTries.sort((a, b) => a - b);
const med =
  innerTries.length === 0 ? null : innerTries[Math.floor(innerTries.length / 2)];

console.log(
  JSON.stringify(
    {
      trials,
      maxInnerAttemptsPerTrial: maxT,
      successes,
      successRate: successes / trials,
      medianInnerTriesOnSuccess: med,
      p95InnerTries:
        innerTries.length === 0 ? null : innerTries[Math.floor(innerTries.length * 0.95)],
      elapsedMs: Date.now() - t0,
    },
    null,
    2
  )
);
