// Builds assets/contributions.svg from the public GitHub contribution calendar.
//
// Usage:
//   node scripts/build-contributions.mjs            fetch live data and render
//   node scripts/build-contributions.mjs --offline  re-render from data/contributions.json
//   node scripts/build-contributions.mjs --html f   parse a saved HTML file (debugging)
//
// Safety: if fetching, parsing or validation fails, nothing is written and the
// last valid snapshot + SVG stay in place. Data is never synthesized.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { theme as t, MONO, esc, svgDoc, readJson, writeIfChanged, ROOT } from './lib/svg.mjs';

const SNAPSHOT = 'data/contributions.json';
const OUTPUT = 'assets/contributions.svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function fetchCalendar(username, { attempts = 3, timeoutMs = 20000 } = {}) {
  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions`;
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': `${username}-profile-readme`, Accept: 'text/html' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`fetch ${url} failed after ${attempts} attempts: ${lastError?.message}`);
}

// Parses GitHub's calendar markup: <td data-date data-level id> cells plus
// <tool-tip for=id>N contributions on …</tool-tip> labels carrying the counts.
export function parseCalendar(html) {
  const cells = new Map();
  for (const m of html.matchAll(/<td\b[^>]*\bdata-date="[^"]*"[^>]*>/g)) {
    const tag = m[0];
    const date = attr(tag, 'data-date');
    const level = Number(attr(tag, 'data-level'));
    const id = attr(tag, 'id');
    if (!id) throw new Error(`calendar cell ${date} has no id`);
    cells.set(id, { date, level, count: null });
  }

  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const cell = cells.get(m[1]);
    if (!cell) continue;
    const label = m[2].trim();
    if (/^No contributions/i.test(label)) cell.count = 0;
    else {
      const n = label.match(/^([\d,]+) contributions?\b/i);
      if (n) cell.count = Number(n[1].replace(/,/g, ''));
    }
  }

  const days = [...cells.values()].sort((a, b) => a.date.localeCompare(b.date));
  validate(days);

  const total = days.reduce((sum, d) => sum + d.count, 0);
  const heading = html.match(/id="js-contribution-activity-description"[^>]*>\s*([\d,]+)\s+contributions?/);
  if (heading && Number(heading[1].replace(/,/g, '')) !== total) {
    console.warn(`::warning::calendar heading says ${heading[1]} but daily counts sum to ${total}; using daily counts`);
  }
  return { total, days };
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

export function validate(days) {
  if (days.length < 350 || days.length > 380) {
    throw new Error(`expected ~1 year of days, parsed ${days.length}`);
  }
  let prev = null;
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(`${d.date}T00:00:00Z`))) {
      throw new Error(`invalid date "${d.date}"`);
    }
    if (!Number.isInteger(d.level) || d.level < 0 || d.level > 4) {
      throw new Error(`invalid level on ${d.date}`);
    }
    if (!Number.isInteger(d.count) || d.count < 0) throw new Error(`missing count on ${d.date}`);
    if ((d.count === 0) !== (d.level === 0)) throw new Error(`count/level mismatch on ${d.date}`);
    if (prev && dayDiff(prev.date, d.date) !== 1) throw new Error(`gap between ${prev.date} and ${d.date}`);
    prev = d;
  }
}

function dayDiff(a, b) {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
}

export function render({ username, title, total, days }) {
  const cell = 11;
  const step = 14;
  const left = 64;
  const top = 92;
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const offset = first.getUTCDay(); // Sunday-first rows, matching GitHub
  const weeks = Math.ceil((days.length + offset) / 7);
  const W = Math.max(left + weeks * step + 30, 860);
  const H = top + 7 * step + 50;
  const fromDate = days[0].date;
  const toDate = days[days.length - 1].date;
  const active = days.filter((d) => d.count > 0).length;

  const cells = [];
  const monthLabels = [];
  let lastMonth = -1;
  days.forEach((d, i) => {
    const pos = i + offset;
    const w = Math.floor(pos / 7);
    const r = pos % 7;
    const x = left + w * step;
    const y = top + r * step;
    const label = `${d.count === 0 ? 'No' : d.count} contribution${d.count === 1 ? '' : 's'} on ${d.date}`;
    cells.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" class="c w${w % 53}" fill="${t.levels[d.level]}"><title>${label}</title></rect>`,
    );
    const month = new Date(`${d.date}T00:00:00Z`).getUTCMonth();
    if (month !== lastMonth && r <= 3 && w < weeks - 1) {
      monthLabels.push(`<text x="${x}" y="${top - 10}" class="lbl">${MONTHS[month]}</text>`);
      lastMonth = month;
    }
  });

  const dayLabels = [
    [1, 'Mon'],
    [3, 'Wed'],
    [5, 'Fri'],
  ]
    .map(([r, s]) => `<text x="${left - 12}" y="${top + r * step + 9}" text-anchor="end" class="lbl">${s}</text>`)
    .join('');

  const legendX = W - 30 - 5 * step - 72;
  const legend = t.levels
    .map((c, i) => `<rect x="${legendX + 36 + i * step}" y="${H - 31}" width="${cell}" height="${cell}" rx="2" fill="${c}"/>`)
    .join('');

  const summary =
    total === 0
      ? 'No public contributions in this period yet — refreshed daily.'
      : `${total.toLocaleString('en-US')} contribution${total === 1 ? '' : 's'} on ${active} day${active === 1 ? '' : 's'} in the last year`;

  const delays = Array.from({ length: 53 }, (_, w) => `.w${w}{animation-delay:${(0.2 + w * 0.02).toFixed(2)}s}`).join('');

  const style = `
text { font-family: ${MONO}; }
.chrome { fill: ${t.muted}; font-size: 12px; }
.lbl { fill: ${t.muted}; font-size: 10px; }
.head { fill: ${t.text}; font-size: 14px; }
.prompt { fill: ${t.green}; font-size: 14px; }
.sum { fill: ${t.cyan}; font-size: 12px; }
.c { stroke: ${t.bg}; stroke-opacity: 0.4; animation: pop 0.4s ease-out both; }
${delays}
@keyframes pop { from { opacity: 0; } to { opacity: 1; } }`;

  const body = `
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
<text x="24" y="32" class="prompt">#</text><text x="40" y="32" class="head">${esc(title)} · @${esc(username)}</text>
<text x="24" y="54" class="sum">${esc(summary)}</text>
${monthLabels.join('')}
${dayLabels}
${cells.join('\n')}
<text x="24" y="${H - 22}" class="lbl">${fromDate} → ${toDate} · public GitHub data</text>
<text x="${legendX}" y="${H - 22}" class="lbl">Less</text>${legend}<text x="${legendX + 36 + 5 * step + 4}" y="${H - 22}" class="lbl">More</text>`;

  return svgDoc({
    width: W,
    height: H,
    title: `${title}: ${username}`,
    desc: `Contribution heatmap for ${username} from public GitHub data, ${fromDate} to ${toDate}. ${summary}`,
    style,
    body,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const config = readJson('profile.config.json');
  const { username } = config;
  let snapshot;

  try {
    if (args.includes('--offline')) {
      if (!existsSync(join(ROOT, SNAPSHOT))) throw new Error(`${SNAPSHOT} not found; run without --offline first`);
      snapshot = readJson(SNAPSHOT);
      validate(snapshot.days);
    } else {
      const htmlArg = args.indexOf('--html');
      const html = htmlArg !== -1 ? readFileSync(args[htmlArg + 1], 'utf8') : await fetchCalendar(username);
      const { total, days } = parseCalendar(html);
      snapshot = { username, source: `https://github.com/users/${username}/contributions`, total, days };
    }
  } catch (err) {
    const kept = existsSync(join(ROOT, OUTPUT));
    console.error(`::warning::contribution refresh skipped: ${err.message}`);
    console.error(kept ? `keeping last valid ${OUTPUT}` : `no previous ${OUTPUT} exists`);
    process.exitCode = kept ? 0 : 1;
    return;
  }

  const svg = render({ username, title: config.contributions.title, total: snapshot.total, days: snapshot.days });
  const dataChanged = writeIfChanged(SNAPSHOT, `${JSON.stringify(snapshot, null, 1)}\n`);
  const svgChanged = writeIfChanged(OUTPUT, svg);
  console.log(`${dataChanged ? 'updated  ' : 'unchanged'} ${SNAPSHOT}`);
  console.log(`${svgChanged ? 'updated  ' : 'unchanged'} ${OUTPUT} (${snapshot.total} contributions, ${snapshot.days.length} days)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
