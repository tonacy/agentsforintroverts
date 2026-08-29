import { readFileSync, writeFileSync } from "node:fs";

const [outputPath, ...inputPaths] = process.argv.slice(2);

if (!outputPath || inputPaths.length === 0) {
  throw new Error("Usage: node scripts/pack-png-ico.mjs output.ico icon-16.png [icon-32.png ...]");
}

const pngs = inputPaths.map((path) => {
  const data = readFileSync(path);
  const signature = data.subarray(0, 8).toString("hex");

  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG file`);
  }

  return {
    data,
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);

let imageOffset = 6 + pngs.length * 16;
const entries = pngs.map(({ data, width, height }) => {
  const entry = Buffer.alloc(16);

  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(imageOffset, 12);
  imageOffset += data.length;

  return entry;
});

writeFileSync(outputPath, Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)]));
