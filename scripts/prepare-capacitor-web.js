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

// Capacitor on Android uses http://localhost, not file://.
// Replace the runtime protocol check with a hard-coded true so the
// native build always activates the absolute sync URL and skips SW registration.
html = html.replace(
  'const IS_NATIVE_APP=window.location.protocol==="file:";',
  "const IS_NATIVE_APP=true; // capacitor native build"
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
