/**
 * Generates PWA icons for Faye.
 * Run once: node scripts/generate-icons.mjs
 * Output: public/icons/icon-192.png, icon-512.png, icon-512-maskable.png
 */

import sharp from "sharp";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/icons");

await mkdir(outDir, { recursive: true });

// Leaf/sprout SVG — Faye blue background, white plant icon, rounded corners
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#037EF3"/>
  <path d="M50 78 L50 44" stroke="white" stroke-width="4.5" stroke-linecap="round" fill="none"/>
  <path d="M50 63 C45 57 30 55 28 43 C40 40 52 50 50 63Z" fill="white"/>
  <path d="M50 52 C55 46 70 44 72 32 C60 29 48 39 50 52Z" fill="white"/>
</svg>
`;

// Maskable icon — full bleed background (no rounded corners), icon scaled to
// ~65% and centered so Android's adaptive crop never clips it
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#037EF3"/>
  <g transform="translate(17.5 17.5) scale(0.65)">
    <path d="M50 78 L50 44" stroke="white" stroke-width="4.5" stroke-linecap="round" fill="none"/>
    <path d="M50 63 C45 57 30 55 28 43 C40 40 52 50 50 63Z" fill="white"/>
    <path d="M50 52 C55 46 70 44 72 32 C60 29 48 39 50 52Z" fill="white"/>
  </g>
</svg>
`;

for (const size of [192, 512]) {
  await sharp(Buffer.from(iconSvg))
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

await sharp(Buffer.from(maskableSvg))
  .resize(512, 512)
  .png()
  .toFile(path.join(outDir, "icon-512-maskable.png"));
console.log("✓ icon-512-maskable.png");

console.log("\nDone — icons written to public/icons/");
