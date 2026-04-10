/**
 * Reads words8.txt and writes words8.generated.js (only /^[a-z]{8}$/ lines).
 * Run from wordle/: node scripts/build-words8.js
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const src = path.join(root, "words8.txt");
const out = path.join(root, "words8.generated.js");

if (!fs.existsSync(src)) {
  console.warn("words8.txt not found; writing empty WORDS8.");
  fs.writeFileSync(out, "var WORDS8=[];\n", "utf8");
  process.exit(0);
}

const raw = fs.readFileSync(src, "utf8");
const words = [];
for (const line of raw.split(/\r?\n/)) {
  const w = line.trim().toLowerCase();
  if (/^[a-z]{8}$/.test(w)) words.push(w);
}
words.sort();
const json = JSON.stringify(words);
fs.writeFileSync(out, `var WORDS8=${json};\n`, "utf8");
console.log(`words8.generated.js: ${words.length} eight-letter words`);
