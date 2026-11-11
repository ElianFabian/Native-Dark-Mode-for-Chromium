// Rebuild synthetic test artwork with Node only. No third-party website assets.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const directory = new URL('../../../fixtures/diagnostics/assets/', import.meta.url);
await mkdir(directory, { recursive: true });
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function png(width, height, paint) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const bytes = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bytes.set(paint(x, y), y * (width * 4 + 1) + 1 + x * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(bytes)), chunk('IEND', Buffer.alloc(0))]);
}
const silhouette = (x, y, shift = 0) => x >= 12 + shift && x < 52 + shift && y >= 8 && y < 36 && (x < 16 + shift || x >= 48 + shift || y < 12 || y >= 32) || y >= 38 && y < 42 && x > 6 + shift && x < 58 + shift;
await writeFile(new URL('single-ink.png', directory), png(64, 48, (x, y) => silhouette(x, y) ? [12, 65, 75, 255] : [0, 0, 0, 0]));
await writeFile(new URL('multicolor.png', directory), png(64, 48, (x, y) => silhouette(x, y) ? x < 32 ? [0, 115, 160, 255] : [224, 35, 90, 255] : [0, 0, 0, 0]));
await writeFile(new URL('opaque-artwork.png', directory), png(160, 96, (x, y) => [Math.round(255 * x / 159), Math.round(255 * y / 95), Math.round(160 + 80 * Math.sin(x / 10) * Math.cos(y / 10)), 255]));
await writeFile(new URL('bright-picture.png', directory), png(160, 96, (x, y) => {
  const value = 235 + (x + y) % 20;
  return [value, value, value, 255];
}));
await writeFile(new URL('dark-picture.png', directory), png(160, 96, (x, y) => {
  const value = 15 + (x + y) % 20;
  return [value, value, value, 255];
}));
// Deliberate frequent LZW clear codes keep the tiny encoder fixed-width and deterministic.
function gif(frames, { transparent = true, multicolor = false } = {}) {
  const width = 64, height = 48;
  const palette = Buffer.from([255,255,255, 15,15,15, 15,105,145, 215,35,85, 0,160,80, 240,195,20, 100,50,190, 255,255,255]);
  const pieces = [Buffer.from('GIF89a'), Buffer.from([width,0,height,0,0xf2,0,0]), palette];
  if (frames > 1) pieces.push(Buffer.from([0x21,0xff,11]), Buffer.from('NETSCAPE2.0'), Buffer.from([3,1,0,0,0]));
  for (let frame = 0; frame < frames; frame++) {
    pieces.push(Buffer.from([0x21,0xf9,4, transparent ? 9 : 8, 40,0,0,0, 0x2c,0,0,0,0,width,0,height,0,0, 3]));
    const codes = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) codes.push(8, silhouette(x, y, frame * 3) ? multicolor ? x < 32 ? 2 : 3 : 1 : 0);
    codes.push(9); const data = Buffer.alloc(Math.ceil(codes.length / 2));
    codes.forEach((v, i) => { data[i >> 1] |= v << (i % 2 * 4); });
    for (let offset = 0; offset < data.length; offset += 255) { const block = data.subarray(offset, offset + 255); pieces.push(Buffer.from([block.length]), block); }
    pieces.push(Buffer.from([0]));
  }
  pieces.push(Buffer.from([0x3b])); return Buffer.concat(pieces);
}
await writeFile(new URL('static-transparent.gif', directory), gif(1));
await writeFile(new URL('animated-transparent.gif', directory), gif(2));
await writeFile(new URL('static-multicolor.gif', directory), gif(1, { multicolor: true }));
await writeFile(new URL('opaque.gif', directory), gif(1, { transparent: false, multicolor: true }));
console.log('Generated nine deterministic PNG/GIF fixture assets.');
