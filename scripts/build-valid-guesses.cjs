const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'wordle.html');
const txtPath = path.join(__dirname, '..', 'words_full.txt');

const html = fs.readFileSync(htmlPath, 'utf8');
const line = html.split('\n').find(l => l.trimStart().startsWith('const WORDS='));
const arrText = line.trim().slice('const WORDS='.length).replace(/;$/, '');
// Single-quoted JS array → extract word values directly
const wordsArr = arrText.slice(1, -1).split("','").map(w => w.replace(/^'|'$/g, ''));

const fullWordsRaw = fs.readFileSync(txtPath, 'utf8').split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length === 5);
const fullWordsSet = new Set(fullWordsRaw);

const missing = wordsArr.filter(w => !fullWordsSet.has(w));
console.log('Total WORDS (target list):', wordsArr.length);
console.log('Total words_full.txt:', fullWordsSet.size);
console.log('Missing from words_full.txt:', missing.length);
if (missing.length > 0) {
  console.log('Missing words:', missing.join(', '));
}

// Build combined sorted list (deduplicated)
const combined = [...new Set([...fullWordsRaw, ...missing])].sort();
console.log('Combined VALID_GUESSES size:', combined.length);

// Output the JS array line
const jsLine = `const VALID_GUESSES=${JSON.stringify(combined)};`;
console.log('\nFirst 80 chars of output:', jsLine.slice(0, 80));

// Inject into wordle.html: replace "const WORD_LENGTH=5;" with VALID_GUESSES + WORD_LENGTH
const marker = 'const WORD_LENGTH=5;';
if (!html.includes(marker)) {
  console.error('ERROR: marker not found in wordle.html');
  process.exit(1);
}
// Remove any previously injected VALID_GUESSES line first
let newHtml = html.replace(/^const VALID_GUESSES=\[.*\];\n/m, '');
newHtml = newHtml.replace(marker, jsLine + '\n' + marker);
fs.writeFileSync(htmlPath, newHtml);
console.log('\nInjected VALID_GUESSES into wordle.html');
