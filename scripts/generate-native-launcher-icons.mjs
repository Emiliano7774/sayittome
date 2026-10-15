import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Android launcher-only branding. Keep web/PWA and Play Store listing untouched.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = path.join(root, "assets", "brand");
const main = path.join(brand, "app-icon-launcher-20261015.png");
const adaptive = path.join(brand, "app-icon-adaptive-20261015.png");
for (const p of [main, adaptive]) if (!fs.existsSync(p)) throw new Error("Missing brand source: " + p);
const res = path.join(root, "android/app/src/main/res");
const densities = {
  "mipmap-mdpi": [48, 108],
  "mipmap-hdpi": [72, 162],
  "mipmap-xhdpi": [96, 216],
  "mipmap-xxhdpi": [144, 324],
  "mipmap-xxxhdpi": [192, 432],
};
for (const [dir, [icon, foreground]] of Object.entries(densities)) {
  const out = path.join(res, dir);
  fs.mkdirSync(out, { recursive: true });
  for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
    await sharp(main).resize(icon, icon).png().toFile(path.join(out, name));
  }
  await sharp(adaptive).resize(foreground, foreground).png().toFile(path.join(out, "ic_launcher_foreground.png"));
}
fs.writeFileSync(path.join(res, "values/ic_launcher_background.xml"),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#140027</color>\n</resources>\n');
console.log("PASS native Android launcher icon: 5 densities, legacy/round/adaptive");
