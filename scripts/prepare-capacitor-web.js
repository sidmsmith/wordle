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

// wordle.html and db-view.html use API_ORIGIN for /api so browser and WebView match.

fs.writeFileSync(path.join(webDir, "index.html"), html, "utf8");

const dbViewSrc = path.join(projectRoot, "db-view.html");
if (fs.existsSync(dbViewSrc)) {
  fs.copyFileSync(dbViewSrc, path.join(webDir, "db-view.html"));
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
