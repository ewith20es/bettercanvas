import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
const dir = "apps/web/public/icons";
await mkdir(dir, { recursive: true });
const icon = await readFile("apps/web/public/favicon.svg");
await sharp(icon).resize(192, 192).png().toFile(`${dir}/icon-192.png`);
await sharp(icon).resize(512, 512).png().toFile(`${dir}/icon-512.png`);
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#23674c" },
})
  .composite([
    {
      input: await sharp(icon).resize(320, 320).png().toBuffer(),
      gravity: "center",
    },
  ])
  .png()
  .toFile(`${dir}/maskable-512.png`);
