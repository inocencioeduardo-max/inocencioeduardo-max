// Generates assets/avatar.svg: a square, static version of the ASCII portrait for
// use as a GitHub profile picture. GitHub avatars must be PNG/JPG/GIF, so render it:
//   chrome --headless=new --hide-scrollbars --window-size=500,500 --screenshot=avatar.png assets/avatar.svg
// then upload avatar.png at github.com/settings/profile.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { theme as t, MONO, CHAR, ROOT, esc, readJson, writeIfChanged } from './lib/svg.mjs';

const SIZE = 500;
const config = readJson('profile.config.json');
// Head-and-shoulders crop of the portrait grid (rows/columns of data/portrait.txt).
const CROP = { top: 1, rows: 36, left: 10, columns: 64 };
const lines = readFileSync(join(ROOT, config.portrait.source), 'utf8')
  .split('\n')
  .slice(CROP.top, CROP.top + CROP.rows)
  .map((l) => l.slice(CROP.left, CROP.left + CROP.columns).replace(/\s+$/, ''));
const columns = CROP.columns;

// Fit the art inside a centred square with margin; GitHub crops avatars to a circle.
const inner = SIZE * 0.9;
const charW = inner / columns;
const fontSize = charW / CHAR;
const lineH = fontSize * 1.12;
const artH = lines.length * lineH;
const x0 = (SIZE - inner) / 2;
const y0 = (SIZE - artH) / 2;
const scanY = (y0 + artH * 0.8).toFixed(1); // across the chin/neck, clear of the eyes

const rows = lines
  .map((line, i) => {
    if (!line.trim()) return '';
    const y = (y0 + (i + 0.8) * lineH).toFixed(1);
    return `<text x="${x0.toFixed(1)}" y="${y}" textLength="${(line.length * charW).toFixed(1)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(line)}</text>`;
  })
  .filter(Boolean)
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-labelledby="title">
<title id="title">ASCII portrait of Inocencio Eduardo (profile picture)</title>
<defs>
<linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${t.green}" stop-opacity="0"/>
<stop offset="1" stop-color="${t.green}" stop-opacity="0.3"/>
</linearGradient>
<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.7">
<stop offset="0.6" stop-color="${t.bg}" stop-opacity="0"/>
<stop offset="1" stop-color="#010409" stop-opacity="0.9"/>
</radialGradient>
</defs>
<rect width="${SIZE}" height="${SIZE}" fill="${t.bg}"/>
<g font-family="${MONO.replace(/'/g, '&#39;')}" font-size="${fontSize.toFixed(2)}" fill="${t.ascii}">
${rows}
</g>
<rect x="0" y="${(Number(scanY) - 46).toFixed(1)}" width="${SIZE}" height="46" fill="url(#glow)"/>
<rect x="0" y="${scanY}" width="${SIZE}" height="1.6" fill="${t.bright}" opacity="0.9"/>
<rect width="${SIZE}" height="${SIZE}" fill="url(#vignette)"/>
</svg>
`;

console.log(`${writeIfChanged('assets/avatar.svg', svg) ? 'updated  ' : 'unchanged'} assets/avatar.svg`);
