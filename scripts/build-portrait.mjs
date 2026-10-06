// Converts a photo (PNG) into the ASCII art stored in data/portrait.txt.
// Run it once per photo; build-static.mjs turns the text into assets/portrait.svg.
// The photo itself is never committed; only the ASCII text is.
//
// Usage:
//   node scripts/build-portrait.mjs photo.png [options]
//     --crop x,y,w,h    crop region in source pixels (default: centred crop to fit)
//     --gamma 1.0       <1 brightens midtones, >1 darkens
//     --knockout 0.08   blank out pixels this close to the background tone
//                       (estimated from the image border); 0 disables
//     --sharpen 0.8     edge boost before mapping to glyphs; 0 disables
//     --invert          dense glyphs for dark areas instead of light areas
//
// JPEG/HEIC: convert to PNG first (any image editor, or `magick in.jpg out.png`).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { readJson, writeIfChanged } from './lib/svg.mjs';
import { portraitGrid } from './lib/layout.mjs';

// Sparse → dense. Dense glyphs render brightest on the dark card.
export const RAMP = " .`:-=+*cs#%@";

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file (convert JPEG/HEIC to PNG first)');
  let pos = 8;
  let header;
  let palette;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const { width, height, depth, colorType, interlace } = header;
  if (interlace) throw new Error('interlaced PNGs are not supported; re-save without interlacing');
  if (depth !== 8 && depth !== 16) throw new Error(`unsupported PNG bit depth ${depth}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);
  if (colorType === 3 && depth !== 8) throw new Error('palette PNGs must be 8-bit');

  const bpp = channels * (depth / 8);
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 0xff;
    }
  }

  // Luminance 0..1, composited over white where transparent.
  const lum = new Float32Array(width * height);
  const step = depth / 8;
  for (let i = 0; i < width * height; i++) {
    const s = (k) => px[i * bpp + k * step] / 255;
    let r;
    let g;
    let b;
    let alpha = 1;
    if (colorType === 3) {
      const p = px[i] * 3;
      [r, g, b] = [palette[p] / 255, palette[p + 1] / 255, palette[p + 2] / 255];
    } else if (channels <= 2) {
      r = g = b = s(0);
      if (channels === 2) alpha = s(1);
    } else {
      [r, g, b] = [s(0), s(1), s(2)];
      if (channels === 4) alpha = s(3);
    }
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) * alpha + (1 - alpha);
  }
  return { width, height, lum };
}

export function toAscii(img, { columns, rows, cellAspect }, opts = {}) {
  const { gamma = 1, knockout = 0.08, invert = false, sharpen = 0.8 } = opts;
  // Crop to the grid's physical aspect so faces aren't stretched.
  const targetAspect = columns / (rows * cellAspect);
  let { x = 0, y = 0, w = img.width, h = img.height } = opts.crop ?? {};
  if (!opts.crop) {
    if (w / h > targetAspect) {
      const nw = Math.round(h * targetAspect);
      x = Math.round((w - nw) / 2);
      w = nw;
    } else {
      const nh = Math.round(w / targetAspect);
      y = 0; // keep the top of the frame: heads are usually near the top
      h = nh;
    }
  }

  // Area-average each cell.
  const cells = new Float32Array(columns * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x0 = Math.floor(x + (c * w) / columns);
      const x1 = Math.max(x0 + 1, Math.floor(x + ((c + 1) * w) / columns));
      const y0 = Math.floor(y + (r * h) / rows);
      const y1 = Math.max(y0 + 1, Math.floor(y + ((r + 1) * h) / rows));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += img.lum[yy * img.width + xx];
      cells[r * columns + c] = sum / ((x1 - x0) * (y1 - y0));
    }
  }

  // Background tone = median of the border cells.
  const border = [];
  for (let c = 0; c < columns; c++) border.push(cells[c], cells[(rows - 1) * columns + c]);
  for (let r = 0; r < rows; r++) border.push(cells[r * columns], cells[r * columns + columns - 1]);
  border.sort((a, b) => a - b);
  const bg = border[border.length >> 1];

  const isBackground = (i) => knockout > 0 && Math.abs(cells[i] - bg) < knockout;

  // Unsharp mask: boosts edges (eyes, glasses, mouth) lost to downsampling.
  const sharp = new Float32Array(cells.length);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      let sum = 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < columns) {
            sum += cells[rr * columns + cc];
            n++;
          }
        }
      }
      const i = r * columns + c;
      sharp[i] = cells[i] + sharpen * (cells[i] - sum / n);
    }
  }

  // Histogram-equalize the subject so its tones use the whole glyph ramp.
  const subject = [];
  for (let i = 0; i < cells.length; i++) if (!isBackground(i)) subject.push(sharp[i]);
  subject.sort((a, b) => a - b);
  // Fraction of subject cells at or below v, so the brightest tone maps to 1.
  const rank = (v) => {
    let lo = 0;
    let hi = subject.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (subject[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return subject.length ? lo / subject.length : 0;
  };

  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < columns; c++) {
      const i = r * columns + c;
      if (isBackground(i)) {
        line += ' ';
        continue;
      }
      let t = Math.min(1, Math.max(0, rank(sharp[i])));
      t = t ** gamma;
      if (invert) t = 1 - t;
      line += RAMP[Math.round(t * (RAMP.length - 1))];
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = {};
  const file = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.match(/^--(crop|gamma|knockout|sharpen)$/));
  const val = (name) => argv[argv.indexOf(name) + 1];
  if (argv.includes('--crop')) {
    const [x, y, w, h] = val('--crop').split(',').map(Number);
    opts.crop = { x, y, w, h };
  }
  if (argv.includes('--gamma')) opts.gamma = Number(val('--gamma'));
  if (argv.includes('--knockout')) opts.knockout = Number(val('--knockout'));
  if (argv.includes('--sharpen')) opts.sharpen = Number(val('--sharpen'));
  if (argv.includes('--invert')) opts.invert = true;
  return { file, opts };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { file, opts } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('usage: node scripts/build-portrait.mjs photo.png [--crop x,y,w,h] [--gamma n] [--knockout n] [--sharpen n] [--invert]');
    process.exit(1);
  }
  const config = readJson('profile.config.json');
  const grid = portraitGrid(config.portrait.columns);
  const ascii = toAscii(decodePng(readFileSync(file)), grid, opts);
  const changed = writeIfChanged(config.portrait.source, `${ascii}\n`);
  console.log(`${changed ? 'updated  ' : 'unchanged'} ${config.portrait.source} (${grid.columns}×${grid.rows})`);
  console.log(ascii);
}
