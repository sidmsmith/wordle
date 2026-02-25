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

// Standard launcher icon sizes (used by pre-API-26 and as fallback).
const launcherSizes = [
  { dir: "mipmap-mdpi",    px: 48 },
  { dir: "mipmap-hdpi",    px: 72 },
  { dir: "mipmap-xhdpi",   px: 96 },
  { dir: "mipmap-xxhdpi",  px: 144 },
  { dir: "mipmap-xxxhdpi", px: 192 },
];

// Adaptive icon foreground sizes (108dp equivalent per density).
// Android crops to a circle/squircle, so fill the full layer.
const foregroundSizes = [
  { dir: "mipmap-mdpi",    px: 108 },
  { dir: "mipmap-hdpi",    px: 162 },
  { dir: "mipmap-xhdpi",   px: 216 },
  { dir: "mipmap-xxhdpi",  px: 324 },
  { dir: "mipmap-xxxhdpi", px: 432 },
];

for (let i = 0; i < launcherSizes.length; i++) {
  const { dir, px } = launcherSizes[i];
  const fgPx = foregroundSizes[i].px;
  const destDir = path.join(androidRes, dir);
  fs.mkdirSync(destDir, { recursive: true });

  await sharp(src).resize(px, px).toFile(path.join(destDir, "ic_launcher.png"));
  await sharp(src).resize(px, px).toFile(path.join(destDir, "ic_launcher_round.png"));

  // Foreground layer: icon centered in the full 108dp layer with padding so
  // the icon sits well within the adaptive-icon safe zone.
  const iconPx = Math.round(fgPx * 0.6); // 60% = comfortably inside safe zone
  const padding = Math.round((fgPx - iconPx) / 2);
  await sharp(src)
    .resize(iconPx, iconPx)
    .extend({ top: padding, bottom: fgPx - iconPx - padding,
               left: padding, right: fgPx - iconPx - padding,
               background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(destDir, "ic_launcher_foreground.png"));

  console.log(`✓ ${dir}  launcher:${px}px  foreground:${fgPx}px`);
}

// Set the adaptive icon background to Wordle's dark background colour.
const bgXmlPath = path.join(androidRes, "values", "ic_launcher_background.xml");
fs.writeFileSync(bgXmlPath,
`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#121213</color>
</resources>
`);
console.log("✓ ic_launcher_background set to #121213 (Wordle dark)");

console.log("\nDone — run `npm run cap:sync` then rebuild in Android Studio.");
