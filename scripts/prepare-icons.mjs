import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
const dir = "apps/web/public/icons";
await mkdir(dir, { recursive: true });
const icon = await readFile("apps/web/public/favicon.svg");
await sharp(icon).resize(192, 192).png().toFile(`${dir}/icon-192.png`);
await sharp(icon).resize(512, 512).png().toFile(`${dir}/icon-512.png`);
await sharp(icon).resize(32, 32).png().toFile(`${dir}/favicon-32.png`);
await sharp(icon)
  .resize(180, 180)
  .flatten({ background: "#103e32" })
  .png()
  .toFile(`${dir}/apple-touch-icon.png`);
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#103e32" },
})
  .composite([
    {
      // Keep the full mark within the central 80% maskable safe area.
      input: await sharp(icon).resize(448, 448).png().toBuffer(),
      gravity: "center",
    },
  ])
  .png()
  .toFile(`${dir}/maskable-512.png`);
