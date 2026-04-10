/**
 * Reads words7.txt and writes words7.generated.js (only /^[a-z]{7}$/ lines).
 * Waffle Deluxe needs a large list (~10k+) so random grids can satisfy row/column crosses.
 * Run from wordle/: node scripts/build-words7.js
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const src = path.join(root, "words7.txt");
const out = path.join(root, "words7.generated.js");

if (!fs.existsSync(src)) {
  console.warn("words7.txt not found; writing empty WORDS7.");
  fs.writeFileSync(out, "var WORDS7=[];\n", "utf8");
  process.exit(0);
}

const raw = fs.readFileSync(src, "utf8");
const words = [];
for (const line of raw.split(/\r?\n/)) {
  const w = line.trim().toLowerCase();
  if (/^[a-z]{7}$/.test(w)) words.push(w);
}
words.sort();
const json = JSON.stringify(words);
fs.writeFileSync(out, `var WORDS7=${json};\n`, "utf8");
console.log(`words7.generated.js: ${words.length} seven-letter words`);
