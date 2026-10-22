// Synthetic fixtures only; no real user data is used or sent externally.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const output = path.resolve('test-results/png-to-gif/fixtures');
fs.mkdirSync(output, { recursive: true });
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(name, width, height, pixel) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    const p = pixel(x, y); raw.set(p.length === 3 ? [...p, 255] : p, offset);
  }
  fs.writeFileSync(path.join(output, name), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
png('red.png', 120, 80, () => [255,0,0]);
png('green.png', 120, 80, () => [0,255,0]);
png('blue.png', 120, 80, () => [0,0,255]);
png('transparent.png', 60, 80, (x, y) => x < 30 ? [255,0,0,0] : [0,0,255,255]);
png('<img onerror=alert(1)>.png', 120, 80, () => [255,255,0]);
fs.writeFileSync(path.join(output, 'broken.png'), Buffer.from('not a PNG'));
fs.writeFileSync(path.join(output, 'broken.mp4'), Buffer.from('not an MP4'));
const width = 120, height = 80, fps = 8, seconds = 4;
const colors = [[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
const raw = Buffer.alloc(width * height * 3 * fps * seconds);
for (let f = 0; f < fps * seconds; f++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const color = y < 40 ? (x < 60 ? colors[Math.floor(f/fps)] : [255,255,255]) : (x < 60 ? [0,0,0] : [0,255,255]);
  raw.set(color, ((f * height + y) * width + x) * 3);
}
const movie = path.join(output, 'quadrants-timeline.mp4');
for (const [filename,pixFormat] of [[movie,'yuv420p'],[path.join(output,'quadrants-timeline-444.mp4'),'yuv444p']]) {
  const result = spawnSync(process.env.FFMPEG_EXECUTABLE || 'ffmpeg', ['-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',`${width}x${height}`,'-r',String(fps),'-i','pipe:0','-an','-c:v','libx264','-qp','0','-pix_fmt',pixFormat,'-movflags','+faststart',filename], { input: raw, maxBuffer: 2*1024*1024 });
  if (result.error || result.status !== 0) throw result.error || Error(result.stderr.toString());
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ source:'all fixtures generated locally', width,height,fps,seconds, temporalTopLeft:colors,topRight:[255,255,255],bottomLeft:[0,0,0],bottomRight:[0,255,255] }, null, 2));
console.log('Synthetic PNG/MP4 fixtures: ' + output);
