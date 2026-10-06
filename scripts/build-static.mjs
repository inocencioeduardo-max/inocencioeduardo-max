// Generates assets/portrait.svg (from data/portrait.txt) and assets/card.svg
// (from profile.config.json). Usage: node scripts/build-static.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { theme as t, MONO, CHAR, ROOT, esc, svgDoc, readJson, writeIfChanged, windowChrome } from './lib/svg.mjs';
import { PORTRAIT_W, CARD_W, ROW_H, TITLE_BAR, PAD, portraitGrid } from './lib/layout.mjs';

const config = readJson('profile.config.json');

function buildPortrait() {
  const file = join(ROOT, config.portrait.source);
  if (!existsSync(file)) throw new Error(`${config.portrait.source} missing; run scripts/build-portrait.mjs <photo.png>`);
  const lines = readFileSync(file, 'utf8').replace(/\n+$/, '').split('\n');
  const grid = portraitGrid(config.portrait.columns);
  const charW = grid.width / grid.columns;
  const top = TITLE_BAR + PAD + (grid.height - lines.length * grid.lineHeight) / 2;

  const style = `
text { font-family: ${MONO}; }
.a { fill: ${t.ascii}; font-size: ${grid.fontSize.toFixed(2)}px; white-space: pre; animation: wipe 0.3s linear both; }
@keyframes wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }`;

  const rows = lines
    .map((line, i) => {
      if (!line.trim()) return '';
      const y = (top + (i + 0.8) * grid.lineHeight).toFixed(1);
      const len = (line.length * charW).toFixed(1);
      return `<text x="${PAD}" y="${y}" class="a" textLength="${len}" lengthAdjust="spacingAndGlyphs" xml:space="preserve" style="animation-delay:${(0.2 + i * 0.035).toFixed(3)}s">${esc(line)}</text>`;
    })
    .filter(Boolean)
    .join('\n');

  return svgDoc({
    width: PORTRAIT_W,
    height: ROW_H,
    title: 'ASCII portrait of Inocencio Eduardo',
    desc: 'Monochrome ASCII-art portrait of Ino, head and shoulders, wearing glasses, typed out line by line in a terminal window.',
    style,
    body: `${windowChrome(PORTRAIT_W, ROW_H, 'ino.ascii')}\n${rows}`,
  });
}

function buildCard() {
  const { card, host, username } = config;
  const size = 12.5;
  const lineH = 18;
  const keyX = PAD + 6;
  const valX = keyX + 84;
  const [lead, last] = splitLastWord(card.title);
  const titleSize = 22;
  const handle = `${username}@github`;

  const style = `
text { font-family: ${MONO}; }
.title { fill: ${t.text}; font-size: ${titleSize}px; font-weight: 700; }
.accent { fill: ${t.bright}; }
.host { fill: ${t.green}; font-size: ${size}px; }
.rule { fill: ${t.dim}; font-size: ${size}px; }
.k { fill: ${t.green}; font-size: ${size}px; font-weight: 700; }
.v { fill: ${t.text}; font-size: ${size}px; white-space: pre; }
.tag { fill: ${t.muted}; }
.cursor { fill: ${t.bright}; animation: show 0.01s linear 1.1s both, blink 0.9s steps(1, end) 1.1s 2; }
.type { animation: type 0.8s steps(${card.title.length}, end) 0.3s both; }
.r { animation: fade 0.4s ease-out both; }
@keyframes type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes fade { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
@keyframes show { from { opacity: 0; } to { opacity: 1; } }
@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }`;

  const titleW = Math.round(card.title.length * CHAR * titleSize);
  const parts = [
    `<text x="${keyX}" y="62" class="title type" textLength="${titleW}" lengthAdjust="spacingAndGlyphs">${esc(lead)}<tspan class="accent">${esc(last)}</tspan></text>`,
    `<rect x="${keyX + titleW + 6}" y="45" width="11" height="21" class="cursor"/>`,
    `<text x="${keyX}" y="86" class="host r" style="animation-delay:1.2s">${esc(handle)}</text>`,
    `<text x="${keyX}" y="102" class="rule r" style="animation-delay:1.25s">${'─'.repeat(handle.length)}</text>`,
  ];

  let y = 126;
  let n = 0;
  for (const row of card.rows) {
    row.lines.forEach((line, i) => {
      const delay = (1.3 + n++ * 0.07).toFixed(2);
      const key = i === 0 ? `<text x="${keyX}" y="${y}" class="k">${esc(row.key)}</text>` : '';
      const [text, tag] = line.split(/(?=\[)/);
      const value = `<text x="${valX}" y="${y}" class="v" xml:space="preserve">${esc(text)}${tag ? `<tspan class="tag">${esc(tag)}</tspan>` : ''}</text>`;
      parts.push(`<g class="r" style="animation-delay:${delay}s">${key}${value}</g>`);
      y += lineH;
    });
    y += 6;
  }
  const lastBaseline = y - lineH - 6;
  if (lastBaseline > ROW_H - 44) {
    throw new Error(`card content overflows (last line at ${lastBaseline}px); shorten rows in profile.config.json`);
  }

  // Neofetch-style colour strip.
  const swatches = [...t.levels, t.green, t.bright, t.muted]
    .map((c, i) => `<rect x="${keyX + i * 22}" y="${ROW_H - 32}" width="18" height="10" rx="2" fill="${c}"/>`)
    .join('');
  parts.push(`<g class="r" style="animation-delay:${(1.3 + n * 0.07).toFixed(2)}s">${swatches}</g>`);

  const desc = card.rows.map((r) => `${r.key}: ${r.lines.join(', ')}`).join('. ');
  return svgDoc({
    width: CARD_W,
    height: ROW_H,
    title: card.title,
    desc: `Terminal info card. ${desc}.`,
    style,
    body: `${windowChrome(CARD_W, ROW_H, `${host}: ~/neofetch`)}\n${parts.join('\n')}`,
  });
}

function splitLastWord(text) {
  const i = text.lastIndexOf(' ');
  return i === -1 ? ['', text] : [text.slice(0, i + 1), text.slice(i + 1)];
}

for (const [path, svg] of [
  ['assets/portrait.svg', buildPortrait()],
  ['assets/card.svg', buildCard()],
]) {
  console.log(`${writeIfChanged(path, svg) ? 'updated  ' : 'unchanged'} ${path}`);
}
