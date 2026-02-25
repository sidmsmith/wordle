/**
 * Generates Android launcher icons for all mipmap densities from wordle.png.
 * Run once (or whenever the icon changes) from the wordle/ directory:
 *   node scripts/generate-android-icons.js
 *
 * Requires: npm install sharp --save-dev
 * Requires: android/ folder to exist (run `npx cap add android` first)
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const src = path.join(process.cwd(), "wordle.png");
const androidRes = path.join(process.cwd(), "android", "app", "src", "main", "res");

if (!fs.existsSync(src)) {
  throw new Error("wordle.png not found in project root");
}
if (!fs.existsSync(androidRes)) {
  throw new Error("android/app/src/main/res not found — run `npx cap add android` first");
}

const sizes = [
  { dir: "mipmap-mdpi",    px: 48 },
  { dir: "mipmap-hdpi",    px: 72 },
  { dir: "mipmap-xhdpi",   px: 96 },
  { dir: "mipmap-xxhdpi",  px: 144 },
  { dir: "mipmap-xxxhdpi", px: 192 },
];

for (const { dir, px } of sizes) {
  const destDir = path.join(androidRes, dir);
  fs.mkdirSync(destDir, { recursive: true });

  const destFile = path.join(destDir, "ic_launcher.png");
  await sharp(src).resize(px, px).toFile(destFile);

  const roundFile = path.join(destDir, "ic_launcher_round.png");
  await sharp(src).resize(px, px).toFile(roundFile);

  console.log(`✓ ${dir}/ic_launcher.png  (${px}×${px})`);
}

console.log("\nDone — run `npx cap sync android` then rebuild in Android Studio.");
