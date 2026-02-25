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

// 1. Replace the relative sync API URL with the absolute Vercel URL so the
//    native WebView (served from http://localhost) can reach the cloud.
html = html.replace(
  'fetch("/api/wordle-sync",{',
  'fetch("https://wordle-theta-red.vercel.app/api/wordle-sync",{'
);

// 2. Remove service-worker registration — assets are bundled in the APK, no SW needed.
html = html.replace(
  /if\("serviceWorker" in navigator\)\{[\s\S]*?navigator\.serviceWorker\.register\("\/sw\.js"\)\.catch\(\(\)=>\{\}\);\s*\}\s*\}/,
  "// Native app: service worker not used"
);

fs.writeFileSync(path.join(webDir, "index.html"), html, "utf8");

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
