/**
 * Builds words7.generated.js from seven-letter words.
 *
 * - words7.txt — primary list (e.g. common ~1.4k from Google 10k). Edit this.
 * - words7-supplement.txt — optional extra /^[a-z]{7}$/ words merged in so Waffle
 *   Deluxe can form row/column crosses. Remove when words7.txt is large enough.
 *
 * Run from wordle/: node scripts/build-words7.js
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const primaryPath = path.join(root, "words7.txt");
const supplementPath = path.join(root, "words7-supplement.txt");
const out = path.join(root, "words7.generated.js");

if (!fs.existsSync(primaryPath)) {
  console.warn("words7.txt not found; writing empty WORDS7.");
  fs.writeFileSync(out, "var WORDS7=[];\n", "utf8");
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

const set = new Set();
for (const w of readSevenLetterFile(primaryPath)) set.add(w);
for (const w of readSevenLetterFile(supplementPath)) set.add(w);

const words = [...set].sort();
const json = JSON.stringify(words);
fs.writeFileSync(out, `var WORDS7=${json};\n`, "utf8");
console.log(
  `words7.generated.js: ${words.length} seven-letter words (primary + supplement)`
);
