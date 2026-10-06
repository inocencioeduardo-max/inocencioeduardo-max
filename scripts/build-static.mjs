// Generates assets/header.svg and assets/card.svg from profile.config.json.
// Usage: node scripts/build-static.mjs
import { theme as t, MONO, esc, svgDoc, readJson, writeIfChanged } from './lib/svg.mjs';

const config = readJson('profile.config.json');
const CHAR = 0.6; // approximate monospace advance, in em

function windowChrome(width, height, label) {
  return `
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
<path d="M1 36 H${width - 1}" stroke="${t.border}"/>
<circle cx="22" cy="18" r="5" fill="${t.dim}"/>
<circle cx="40" cy="18" r="5" fill="${t.dim}" opacity="0.7"/>
<circle cx="58" cy="18" r="5" fill="${t.dim}" opacity="0.45"/>
<text x="${width / 2}" y="22.5" text-anchor="middle" class="chrome">${esc(label)}</text>`;
}

function buildHeader() {
  const h = config.header;
  const W = 900;
  const H = 240;
  const titleSize = 46;
  const titleWidth = Math.round(h.title.length * CHAR * titleSize);
  const [lead, last] = splitLastWord(h.title);
  const commandLine = `${h.prompt} ${h.command}`;

  const style = `
text { font-family: ${MONO}; }
.chrome { fill: ${t.muted}; font-size: 12px; }
.prompt { fill: ${t.green}; font-size: 16px; }
.cmd { fill: ${t.text}; font-size: 16px; }
.title { fill: ${t.text}; font-size: ${titleSize}px; font-weight: 700; }
.accent { fill: ${t.cyan}; }
.sub { fill: ${t.cyan}; font-size: 16px; opacity: 0.9; }
.foot { fill: ${t.muted}; font-size: 13px; }
.type1 { animation: type 0.9s steps(${commandLine.length}, end) 0.3s both; }
.type2 { animation: type 0.9s steps(${h.title.length}, end) 1.4s both; }
.fade1 { animation: fade 0.6s ease-out 2.5s both; }
.fade2 { animation: fade 0.6s ease-out 2.9s both; }
.cursor { fill: ${t.green}; animation: show 0.01s linear 2.3s both, blink 0.9s steps(1, end) 2.3s 3; }
@keyframes type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes show { from { opacity: 0; } to { opacity: 1; } }
@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }`;

  const body = `
${windowChrome(W, H, `${config.username} — profile`)}
<text x="40" y="80" class="type1"><tspan class="prompt">${esc(h.prompt)}</tspan><tspan class="cmd"> ${esc(h.command)}</tspan></text>
<text x="40" y="146" class="title type2" textLength="${titleWidth}" lengthAdjust="spacingAndGlyphs">${esc(lead)}<tspan class="accent">${esc(last)}</tspan></text>
<rect x="${40 + titleWidth + 10}" y="110" width="22" height="42" rx="2" class="cursor"/>
<text x="40" y="188" class="sub fade1">${esc(h.subtitle)}</text>
<text x="40" y="216" class="foot fade2"># ${esc(h.footer)}</text>`;

  return svgDoc({
    width: W,
    height: H,
    title: h.title,
    desc: `Terminal window. The command "${h.command}" prints "${h.title}", then "${h.subtitle}" and "${h.footer}".`,
    style,
    body,
  });
}

function buildCard() {
  const { card, blueprint } = config;
  const W = 900;
  const H = 320;
  const split = 570;
  const nodeX = split + 40;
  const nodeW = W - nodeX - 30;
  const nodeH = 40;
  const nodeTop = 74;
  const nodeGap = 20;
  const cx = nodeX + nodeW / 2;

  const style = `
text { font-family: ${MONO}; }
.chrome { fill: ${t.muted}; font-size: 12px; }
.key { fill: ${t.cyan}; font-size: 14px; }
.val { fill: ${t.text}; font-size: 14px; }
.sep { fill: ${t.dim}; font-size: 14px; }
.cap { fill: ${t.muted}; font-size: 12px; }
.node { fill: ${t.panel}; stroke: ${t.border}; }
.node-last { fill: ${t.panel}; stroke: ${t.green}; stroke-opacity: 0.6; }
.nlabel { fill: ${t.text}; font-size: 14px; font-weight: 700; }
.nsub { fill: ${t.muted}; font-size: 12px; }
.wire { stroke: ${t.cyan}; stroke-opacity: 0.55; stroke-width: 1.5; stroke-dasharray: ${nodeGap}; animation: draw 0.35s ease-out both; }
.row, .blk { animation: fade 0.5s ease-out both; }
.packet { fill: ${t.green}; opacity: 0; animation: travel 1.6s ease-in-out 2.4s 1 both; }
@keyframes fade { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
@keyframes draw { from { stroke-dashoffset: ${nodeGap}; } to { stroke-dashoffset: 0; } }
@keyframes travel {
  0% { opacity: 0; transform: translateY(0); }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { opacity: 0; transform: translateY(${(nodeH + nodeGap) * (blueprint.nodes.length - 1)}px); }
}`;

  const rows = card.rows
    .map((row, i) => {
      const y = 84 + i * 32;
      return `<g class="row" style="animation-delay:${(0.3 + i * 0.15).toFixed(2)}s"><text x="40" y="${y}" class="key">${esc(row.key)}</text><text x="146" y="${y}" class="sep">:</text><text x="166" y="${y}" class="val">${esc(row.value)}</text></g>`;
    })
    .join('\n');

  const nodes = blueprint.nodes
    .map((node, i) => {
      const y = nodeTop + i * (nodeH + nodeGap);
      const last = i === blueprint.nodes.length - 1;
      const delay = (0.6 + i * 0.35).toFixed(2);
      const wire = last
        ? ''
        : `\n<path d="M${cx} ${y + nodeH} V${y + nodeH + nodeGap}" class="wire" style="animation-delay:${(Number(delay) + 0.25).toFixed(2)}s"/>`;
      return `<g class="blk" style="animation-delay:${delay}s"><rect x="${nodeX}" y="${y}" width="${nodeW}" height="${nodeH}" rx="6" class="${last ? 'node-last' : 'node'}"/><text x="${nodeX + 14}" y="${y + 25}" class="nlabel">${esc(node.label)}</text><text x="${nodeX + nodeW - 14}" y="${y + 25}" text-anchor="end" class="nsub">${esc(node.sub)}</text></g>${wire}`;
    })
    .join('\n');

  const body = `
<defs>
<pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0 H0 V16" fill="none" stroke="${t.grid}" stroke-width="1"/></pattern>
</defs>
${windowChrome(W, H, `~/${config.username}/${card.title}`)}
<rect x="${split}" y="37" width="${W - split - 1}" height="${H - 38}" fill="url(#grid)"/>
<path d="M${split} 37 V${H - 1}" stroke="${t.border}" stroke-dasharray="3 4"/>
${rows}
<text x="${nodeX}" y="60" class="cap">// ${esc(blueprint.title)}</text>
${nodes}
<circle cx="${cx}" cy="${nodeTop + nodeH / 2}" r="4" class="packet"/>`;

  const rowText = card.rows.map((r) => `${r.key}: ${r.value}`).join('; ');
  const flow = blueprint.nodes.map((n) => `${n.label} (${n.sub})`).join(' → ');
  return svgDoc({
    width: W,
    height: H,
    title: `${config.header.title} — ${card.title}`,
    desc: `Information card. ${rowText}. Blueprint: ${flow}.`,
    style,
    body,
  });
}

function splitLastWord(text) {
  const i = text.lastIndexOf(' ');
  return i === -1 ? ['', text] : [text.slice(0, i + 1), text.slice(i + 1)];
}

for (const [path, svg] of [
  ['assets/header.svg', buildHeader()],
  ['assets/card.svg', buildCard()],
]) {
  console.log(`${writeIfChanged(path, svg) ? 'updated  ' : 'unchanged'} ${path}`);
}
