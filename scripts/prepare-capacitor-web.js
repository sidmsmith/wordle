import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const webDir = path.join(projectRoot, "www");

if (!fs.existsSync(webDir)) {
  fs.mkdirSync(webDir, { recursive: true });
}

// --- index.html: patch wordle.html for native context ---
const htmlSrc = path.join(projectRoot, "wordle.html");
if (!fs.existsSync(htmlSrc)) {
  throw new Error("Missing required source file: wordle.html");
}

let html = fs.readFileSync(htmlSrc, "utf8");

const BASE = "https://wordle-theta-red.vercel.app";

// wordle.html uses API_ORIGIN (same as BASE) for all /api calls so browser and WebView match.

fs.writeFileSync(path.join(webDir, "index.html"), html, "utf8");

// --- db-view.html: patch for native context ---
const dbViewSrc = path.join(projectRoot, "db-view.html");
if (fs.existsSync(dbViewSrc)) {
  let dbViewHtml = fs.readFileSync(dbViewSrc, "utf8");
  dbViewHtml = dbViewHtml.replace(
    'const API_BASE="/api"',
    `const API_BASE="${BASE}/api"` // full API base for native WebView
  );
  fs.writeFileSync(path.join(webDir, "db-view.html"), dbViewHtml, "utf8");
}

// --- Binary / static assets ---
const staticFiles = [
  { from: "wordle.png",    to: "wordle.png" },
  { from: "manifest.json", to: "manifest.json" },
];

for (const file of staticFiles) {
  const src = path.join(projectRoot, file.from);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required source file: ${file.from}`);
  }
  fs.copyFileSync(src, path.join(webDir, file.to));
}

console.log("✓ Capacitor web assets written to ./www");
console.log("  Next: npx cap sync android");
