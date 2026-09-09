import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourcePath = path.join(
  root,
  "design/brand/drifting-page-master.png",
);

const PAPER = { r: 253, g: 251, b: 247 };
// The approved generated mark already has transparency. Preserve its green
// ink, cream paper interior, and texture when sizing the website assets.
const trimmed = await sharp(sourcePath)
  .ensureAlpha()
  .trim({
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    threshold: 3,
  })
  .png()
  .toBuffer();

async function renderMark({
  output,
  size,
  paper = false,
  inset = 0.08,
}) {
  const markWidth = Math.round(size * (1 - inset * 2));
  const markHeight = Math.round(size * (1 - inset * 2));
  const rendered = await sharp(trimmed)
    .resize(markWidth, markHeight, {
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const left = Math.round((size - rendered.info.width) / 2);
  const top = Math.round((size - rendered.info.height) / 2);
  const background = paper
    ? { ...PAPER, alpha: 1 }
    : { r: 0, g: 0, b: 0, alpha: 0 };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: rendered.data, left, top }])
    .png()
    .toFile(output);
}

await renderMark({
  output: path.join(
    root,
    "design/brand/drifting-page-transparent.png",
  ),
  size: 1024,
  inset: 0.07,
});
await renderMark({
  output: path.join(root, "public/brand/drifting-page-mark.png"),
  size: 512,
  inset: 0.06,
});
await renderMark({
  output: path.join(root, "src/app/icon.png"),
  size: 512,
  paper: true,
  inset: 0.08,
});
await renderMark({
  output: path.join(root, "src/app/apple-icon.png"),
  size: 180,
  paper: true,
  inset: 0.1,
});
await renderMark({
  output: path.join(
    root,
    "design/brand/drifting-page-favicon-source.png",
  ),
  size: 256,
  paper: true,
  inset: 0.04,
});
const faviconPngPath = path.join(
  root,
  "design/brand/drifting-page-favicon-32.png",
);

await renderMark({
  output: faviconPngPath,
  size: 32,
  paper: true,
  inset: 0.02,
});

const faviconPng = await fs.readFile(faviconPngPath);
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt8(32, 6);
icoHeader.writeUInt8(32, 7);
icoHeader.writeUInt8(0, 8);
icoHeader.writeUInt8(0, 9);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(faviconPng.length, 14);
icoHeader.writeUInt32LE(icoHeader.length, 18);
await fs.writeFile(
  path.join(root, "src/app/favicon.ico"),
  Buffer.concat([icoHeader, faviconPng]),
);

async function renderSocialCard(source, outputs) {
  const card = await sharp(path.join(root, source))
    .resize(1200, 630, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  await Promise.all(
    outputs.map(async (output) => {
      const outputPath = path.join(root, output);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, card);
    }),
  );
}

await renderSocialCard(
  "design/brand/navigational-shelter-root-og-master.png",
  ["src/app/opengraph-image.png", "src/app/twitter-image.png"],
);
await renderSocialCard(
  "design/brand/navigational-shelter-manifesto-og-master.png",
  [
    "src/app/manifesto/opengraph-image.png",
    "src/app/manifesto/twitter-image.png",
  ],
);

console.log("Built drifting-page brand assets.");
