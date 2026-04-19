/**
 * Builds words7.generated.js from seven-letter words.
 *
 * - words7.txt — primary list (your curated words). Edit this.
 * - words7-supplement.txt — extra /^[a-z]{7}$/ words merged in so Waffle Deluxe
 *   can form row/column crosses. With ~3.5k primary-only words, generation still
 *   fails ~99.7% of the time at the same 20k attempt cap as the game; keep the
 *   supplement unless you raise dictionary size a lot or change the generator.
 *
 * Run: node scripts/build-words7.js
 * Stress-test primary only: node scripts/test-deluxe-primary-only.js
 *
 * Also emits WORDS7_PRIMARY (sorted unique words from words7.txt only) so the
 * client can bias Waffle Deluxe toward common words while keeping the full
 * merged WORDS7 for crosses.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const primaryPath = path.join(root, "words7.txt");
const supplementPath = path.join(root, "words7-supplement.txt");
const out = path.join(root, "words7.generated.js");

if (!fs.existsSync(primaryPath)) {
  console.warn("words7.txt not found; writing empty WORDS7.");
  fs.writeFileSync(out, "var WORDS7=[];\nvar WORDS7_PRIMARY=[];\n", "utf8");
  process.exit(0);
}

function readSevenLetterFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const words = [];
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (/^[a-z]{7}$/.test(w)) words.push(w);
  }
  return words;
}

const primaryList = readSevenLetterFile(primaryPath);
const set = new Set(primaryList);
for (const w of readSevenLetterFile(supplementPath)) set.add(w);

const words = [...set].sort();
const primaryUnique = [...new Set(primaryList)].sort();
const json = JSON.stringify(words);
const primaryJson = JSON.stringify(primaryUnique);
fs.writeFileSync(
  out,
  `var WORDS7=${json};\nvar WORDS7_PRIMARY=${primaryJson};\n`,
  "utf8"
);
console.log(
  `words7.generated.js: ${words.length} seven-letter words (${primaryUnique.length} primary + supplement); WORDS7_PRIMARY=${primaryUnique.length}`
);
