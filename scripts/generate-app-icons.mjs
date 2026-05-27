import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

const SOURCE_CANDIDATES = [
  process.argv[2],
  path.join(webRoot, "assets", "brand", "app-icon-source.png"),
  path.resolve(
    webRoot,
    "..",
    ".cursor",
    "projects",
    "c-Users-emibe-OneDrive-Desktop-Backupvisual-public-extract",
    "assets",
    "c__Users_emibe_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ChatGPT_Image_26_may_2026__08_35_02_p.m.-219605d7-97b6-4390-8182-54a67bfa2a92.png",
  ),
].filter(Boolean);

const SOURCE = SOURCE_CANDIDATES.find((candidate) => fs.existsSync(candidate));

if (!SOURCE) {
  console.error("Imagen fuente no encontrada. Probá:");
  SOURCE_CANDIDATES.forEach((candidate) => console.error(" -", candidate));
  process.exit(1);
}

const CANVAS = 1024;
const LAUNCHER_CONTENT_SCALE = 0.76;
const ADAPTIVE_CONTENT_SCALE = 0.58;
const MASKABLE_CONTENT_SCALE = 0.52;

async function buildCenteredSquareIcon(input, contentScale) {
  const trimmed = await sharp(input).trim({ threshold: 8 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const width = meta.width || CANVAS;
  const height = meta.height || CANVAS;
  const maxSide = Math.max(width, height);
  const target = Math.round(CANVAS * contentScale);
  const scale = target / maxSide;
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));

  const resized = await sharp(trimmed)
    .resize(nextWidth, nextHeight, { fit: "fill" })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function writeFromCanvas(buffer, size, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(buffer).resize(size, size, { fit: "fill" }).png().toFile(outPath);
}

const ANDROID_DENSITIES = {
  "mipmap-mdpi": { launcher: 48, foreground: 108 },
  "mipmap-hdpi": { launcher: 72, foreground: 162 },
  "mipmap-xhdpi": { launcher: 96, foreground: 216 },
  "mipmap-xxhdpi": { launcher: 144, foreground: 324 },
  "mipmap-xxxhdpi": { launcher: 192, foreground: 432 },
};

async function main() {
  const brandDir = path.join(webRoot, "assets", "brand");
  fs.mkdirSync(brandDir, { recursive: true });

  const brandSource = path.join(brandDir, "app-icon-source.png");
  if (SOURCE !== brandSource) {
    fs.copyFileSync(SOURCE, brandSource);
  }

  const launcherBuffer = await buildCenteredSquareIcon(brandSource, LAUNCHER_CONTENT_SCALE);
  const adaptiveBuffer = await buildCenteredSquareIcon(brandSource, ADAPTIVE_CONTENT_SCALE);
  const maskableBuffer = await buildCenteredSquareIcon(brandSource, MASKABLE_CONTENT_SCALE);

  const capacitorRes = path.join(webRoot, "android", "app", "src", "main", "res");
  const nextPublic = path.join(webRoot, "public");
  const outputs = [];

  fs.mkdirSync(path.join(nextPublic, "icons"), { recursive: true });
  await writeFromCanvas(launcherBuffer, 32, path.join(nextPublic, "favicon.png"));
  await writeFromCanvas(launcherBuffer, 192, path.join(nextPublic, "icons", "Icon-192.png"));
  await writeFromCanvas(launcherBuffer, 512, path.join(nextPublic, "icons", "Icon-512.png"));
  await writeFromCanvas(maskableBuffer, 192, path.join(nextPublic, "icons", "Icon-maskable-192.png"));
  await writeFromCanvas(maskableBuffer, 512, path.join(nextPublic, "icons", "Icon-maskable-512.png"));
  await sharp(launcherBuffer).png().toFile(path.join(webRoot, "src", "app", "icon.png"));
  outputs.push(path.join(nextPublic, "favicon.png"));

  for (const [folder, sizes] of Object.entries(ANDROID_DENSITIES)) {
    const base = path.join(capacitorRes, folder);
    await writeFromCanvas(launcherBuffer, sizes.launcher, path.join(base, "ic_launcher.png"));
    await writeFromCanvas(launcherBuffer, sizes.launcher, path.join(base, "ic_launcher_round.png"));
    await writeFromCanvas(adaptiveBuffer, sizes.foreground, path.join(base, "ic_launcher_foreground.png"));
  }

  const bgColorFile = path.join(capacitorRes, "values", "ic_launcher_background.xml");
  fs.writeFileSync(
    bgColorFile,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n`,
    "utf8",
  );

  console.log("Íconos generados desde:", brandSource);
  outputs.forEach((file) => console.log(" -", file));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
