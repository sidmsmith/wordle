/**
 * Computes remaining_counts_json for all existing games using the same
 * filter logic as the in-game counter.  Outputs UPDATE SQL to stdout.
 *
 * Usage (from the wordle/ directory):
 *   node scripts/compute-remaining-counts.js
 */
import fs from "fs";
import path from "path";

// ── Extract WORDS from wordle.html ──────────────────────────────────────────
const html = fs.readFileSync(path.join(process.cwd(), "wordle.html"), "utf8");
const wordsMatch = html.match(/const WORDS=(\[[\s\S]*?\]);/);
if (!wordsMatch) throw new Error("Could not parse WORDS array from wordle.html");
// Word list uses JS single-quote syntax; convert to JSON-compatible double quotes.
// Safe here since all words are pure lowercase [a-z] strings with no apostrophes.
const WORDS = JSON.parse(wordsMatch[1].replace(/'/g, '"'));
const WORD_LENGTH = 5;

// ── Same getTileState logic as the game ────────────────────────────────────
function getTileState(guess, target) {
  const states = Array(WORD_LENGTH).fill("absent");
  const targetCounts = {};
  const guessCounts = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) states[i] = "correct";
    targetCounts[target[i]] = (targetCounts[target[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (states[i] === "correct") guessCounts[guess[i]] = (guessCounts[guess[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (states[i] !== "correct") {
      const letter = guess[i];
      const targetCount = targetCounts[letter] || 0;
      const guessCount = guessCounts[letter] || 0;
      if (target.includes(letter) && guessCount < targetCount) {
        states[i] = "present";
        guessCounts[letter] = (guessCounts[letter] || 0) + 1;
      }
    }
  }
  return states;
}

// ── Same filter logic as the game ──────────────────────────────────────────
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

// ── Game data fetched from DB ───────────────────────────────────────────────
const games = [
  { id: 2,  target_word: "flies",  guesses_json: ["audio","spicy","frisk","flies"] },
  { id: 3,  target_word: "valve",  guesses_json: ["aisle","blaze","valve"] },
  { id: 4,  target_word: "bayed",  guesses_json: ["heist","blare","baked","bayed"] },
  { id: 5,  target_word: "cacti",  guesses_json: ["pleat","tardy","bathe","mound","cacti"] },
  { id: 6,  target_word: "arbor",  guesses_json: ["aisle","awful","artsy","argon","arbor"] },
  { id: 7,  target_word: "breve",  guesses_json: ["aisle","froze","prune","three","dream","breve"] },
  { id: 8,  target_word: "rerun",  guesses_json: ["audio","plume","femur","rerun"] },
  { id: 9,  target_word: "ranch",  guesses_json: ["aisle","brand","rangy","ranch"] },
  { id: 10, target_word: "miter",  guesses_json: ["great","voter","miter"] },
  { id: 11, target_word: "uncap",  guesses_json: ["audio","gauge","fraud","unity","uncap"] },
  { id: 12, target_word: "creep",  guesses_json: ["aisle","honed","muter","renew","egret","creep"] },
  { id: 13, target_word: "limey",  guesses_json: ["aisle","liken","lived","liter","libel","limey"] },
  { id: 14, target_word: "daily",  guesses_json: ["heist","bring","clamp","laity","daily"] },
  { id: 15, target_word: "swath",  guesses_json: ["aisle","sharp","smash","swath"] },
  { id: 16, target_word: "avoid",  guesses_json: ["heist","doily","bingo","crowd","avoid"] },
  { id: 17, target_word: "steel",  guesses_json: ["heist","stare","steep","steel"] },
  { id: 18, target_word: "bowie",  guesses_json: ["train","mould","check","bogie","bowie"] },
  { id: 19, target_word: "toast",  guesses_json: ["heist","joust","worst","boost","coast","toast"] },
  { id: 20, target_word: "joked",  guesses_json: ["audio","bored","moped","coned","wooed","joked"] },
  { id: 21, target_word: "dizzy",  guesses_json: ["outer","chain","jiffy","dizzy"] },
  { id: 22, target_word: "flush",  guesses_json: ["poise","blush","flush"] },
  { id: 23, target_word: "argon",  guesses_json: ["audio","alone","argon"] },
  { id: 24, target_word: "bobby",  guesses_json: ["poise","forum","clank","buggy","bobby"] },
  { id: 25, target_word: "chink",  guesses_json: ["cause","chomp","child","chick","chink"] },
  { id: 26, target_word: "bowie",  guesses_json: ["trail","mound","bogey","bowie"] },
  { id: 27, target_word: "spate",  guesses_json: ["unity","grate","plate","spate"] },
  { id: 28, target_word: "zesty",  guesses_json: ["outie","teach","dusty","zesty"] },
  { id: 29, target_word: "stark",  guesses_json: ["beach","guard","pinto","alarm","start","stark"] },
  { id: 30, target_word: "suing",  guesses_json: ["freak","mound","sunny","suing"] },
  { id: 31, target_word: "sewer",  guesses_json: ["heist","pesky","serum","sewer"] },
  { id: 32, target_word: "tweak",  guesses_json: ["heist","toner","plead","tweak"] },
  { id: 33, target_word: "cabby",  guesses_json: ["heist","mound","crack","cabal","cabby"] },
  { id: 34, target_word: "scant",  guesses_json: ["teach","craft","scant"] },
  { id: 35, target_word: "sheik",  guesses_json: ["aisle","skier","sheik"] },
  { id: 36, target_word: "scamp",  guesses_json: ["tried","pouch","canal","spacy","scamp"] },
  { id: 37, target_word: "wound",  guesses_json: ["touch","mound","pound","wound"] },
  { id: 38, target_word: "range",  guesses_json: ["audio","beach","freak","later","range"] },
  { id: 39, target_word: "usage",  guesses_json: ["heist","spare","usage"] },
  { id: 40, target_word: "mimic",  guesses_json: ["wharf","mound","misty","mimic"] },
  { id: 41, target_word: "added",  guesses_json: ["trick","mound","paled","shady","added"] },
  { id: 42, target_word: "brief",  guesses_json: ["blast","mound","viper","brief"] },
  { id: 43, target_word: "derby",  guesses_json: ["mound","ditch","spear","gravy","derby"] },
  { id: 44, target_word: "grunt",  guesses_json: ["heist","float","uncut","grunt"] },
  { id: 45, target_word: "decry",  guesses_json: ["aisle","power","rerun","beery","decry"] },
  { id: 46, target_word: "savvy",  guesses_json: ["mound","aisle","stack","spray","sassy","savvy"] },
  { id: 47, target_word: "wiser",  guesses_json: ["mound","heist","wiser"] },
  { id: 48, target_word: "maple",  guesses_json: ["aisle","table","maple"] },
  { id: 49, target_word: "trite",  guesses_json: ["water","brute","gripe","trite"] },
  { id: 50, target_word: "owned",  guesses_json: ["aisle","huger","boned","owned"] },
  { id: 51, target_word: "upset",  guesses_json: ["manor","stick","these","zesty","upset"] },
  { id: 52, target_word: "farce",  guesses_json: ["pluck","trace","farce"] },
  { id: 53, target_word: "upper",  guesses_json: ["trace","miner","lower","buyer","upper"] },
  { id: 54, target_word: "churl",  guesses_json: ["crate","curvy","churn","churl"] },
];

// ── Compute remaining counts for each game ─────────────────────────────────
const results = [];
for (const game of games) {
  const history = [];
  const counts = [];
  for (const guess of game.guesses_json) {
    const states = getTileState(guess, game.target_word);
    history.push({ guess, states });
    counts.push(getRemainingWords(history).length);
  }
  results.push({ id: game.id, counts });
}

// ── Output results as JSON for the MCP update step ────────────────────────
console.log(JSON.stringify(results, null, 2));
