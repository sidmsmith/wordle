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

// Replace all relative /api/ calls with absolute Vercel URLs so the native
// WebView (served from http://localhost) can reach the cloud endpoints.
html = html.replace(
  'fetch("/api/wordle-sync",{',
  `fetch("${BASE}/api/wordle-sync",{`
);
html = html.replace(
  'fetch(`/api/wordle-stats?username=',
  `fetch(\`${BASE}/api/wordle-stats?username=`
);
html = html.replace(
  'fetch("/api/wordle-users")',
  `fetch("${BASE}/api/wordle-users")`
);
html = html.replace(
  `const MP_HEARTBEAT_URL="/api/mp-heartbeat"`,
  `const MP_HEARTBEAT_URL="${BASE}/api/mp-heartbeat"`
);
html = html.replace(
  `const MP_ROOM_URL="/api/mp-room"`,
  `const MP_ROOM_URL="${BASE}/api/mp-room"`
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
