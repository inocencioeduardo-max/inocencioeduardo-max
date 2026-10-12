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
import { theme as t, MONO, esc, svgDoc, readJson, writeIfChanged, windowChrome, ROOT } from './lib/svg.mjs';
import { HEATMAP_W, PAD } from './lib/layout.mjs';

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

// Streaks and totals derived only from the parsed day data.
export function stats(days) {
  let longest = 0;
  let run = 0;
  let best = null;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
    if (d.count > 0 && (!best || d.count > best.count)) best = d;
  }
  // Current streak may end yesterday: today isn't over yet.
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  let current = 0;
  while (i >= 0 && days[i].count > 0) {
    current++;
    i--;
  }
  return { active: days.filter((d) => d.count > 0).length, longest, current, best };
}

// Keeps the trailing `months` calendar months of days (12 = the full year GitHub returns).
export function lastMonths(days, months) {
  if (!months || months >= 12) return days;
  const end = new Date(`${days[days.length - 1].date}T00:00:00Z`);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, end.getUTCDate() + 1));
  const from = start.toISOString().slice(0, 10);
  return days.filter((d) => d.date >= from);
}

export function render({ username, title, days: allDays, months = 12 }) {
  const days = lastMonths(allDays, months);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const W = HEATMAP_W;
  const top = 78;
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const offset = first.getUTCDay(); // Sunday-first rows, matching GitHub
  const weeks = Math.ceil((days.length + offset) / 7);
  // Fewer weeks → bigger squares, capped so a short window doesn't get oversized.
  const step = Math.min(24, Math.floor((W - 46 - PAD * 2) / weeks));
  const cell = step - 3;
  const left = Math.round((W - (weeks * step - 3)) / 2 + 12); // centred, leaving room for day labels
  const H = top + 7 * step + 46;
  const fromDate = days[0].date;
  const toDate = days[days.length - 1].date;
  const s = stats(days);

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
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${(cell / 5).toFixed(1)}" class="c d${w + r}" fill="${t.levels[d.level]}"><title>${label}</title></rect>`,
    );
    const month = new Date(`${d.date}T00:00:00Z`).getUTCMonth();
    if (month !== lastMonth && r <= 3 && w < weeks - 1) {
      monthLabels.push(`<text x="${x}" y="${top - 8}" class="lbl">${MONTHS[month]}</text>`);
      lastMonth = month;
    }
  });

  const dayLabels = [
    [1, 'Mon'],
    [3, 'Wed'],
    [5, 'Fri'],
  ]
    .map(([r, l]) => `<text x="${left - 8}" y="${top + r * step + cell / 2 + 3.5}" text-anchor="end" class="lbl">${l}</text>`)
    .join('');

  const footY = H - 18;
  const legendStep = 15;
  const legendX = W - PAD - 5 * legendStep - 70;
  const legend = t.levels
    .map((c, i) => `<rect x="${legendX + 34 + i * legendStep}" y="${footY - 10}" width="12" height="12" rx="2.5" fill="${c}"/>`)
    .join('');
  const period = months >= 12 ? 'the last year' : `the last ${months} months`;

  const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
  const summary =
    total === 0
      ? 'No public contributions in this period yet — refreshed daily.'
      : `${plural(total, 'contribution')} in ${period}`;
  const footer =
    total === 0
      ? `${fromDate} → ${toDate} · public GitHub data`
      : [
          `current streak ${plural(s.current, 'day')}`,
          `longest ${plural(s.longest, 'day')}`,
          `best day ${s.best.count} (${s.best.date})`,
          `${plural(s.active, 'active day')}`,
        ].join(' · ');

  const diagonals = weeks + 7;
  const delays = Array.from({ length: diagonals }, (_, k) => `.d${k}{animation-delay:${(0.15 + k * 0.018).toFixed(3)}s}`).join('');

  const style = `
text { font-family: ${MONO}; }
.lbl { fill: ${t.muted}; font-size: 10px; }
.sum { fill: ${t.green}; font-size: 12.5px; }
.foot { fill: ${t.muted}; font-size: 10.5px; }
.c { animation: drop 0.35s ease-out both; }
${delays}
@keyframes drop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`;

  const body = `
${windowChrome(W, H, `${title} · @${username}`)}
<text x="${PAD + 6}" y="52" class="sum">${esc(summary)}</text>
${monthLabels.join('')}
${dayLabels}
${cells.join('\n')}
<text x="${PAD + 6}" y="${footY}" class="foot">${esc(footer)}</text>
<text x="${legendX}" y="${footY}" class="lbl">Less</text>${legend}<text x="${legendX + 34 + 5 * legendStep + 4}" y="${footY}" class="lbl">More</text>`;

  return svgDoc({
    width: W,
    height: H,
    title: `${title}: ${username}`,
    desc: `Contribution heatmap for ${username} from public GitHub data, ${fromDate} to ${toDate}. ${summary}${total ? `. ${footer}` : ''}`,
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

  const svg = render({ username, title: config.contributions.title, days: snapshot.days, months: config.contributions.months });
  const dataChanged = writeIfChanged(SNAPSHOT, `${JSON.stringify(snapshot, null, 1)}\n`);
  const svgChanged = writeIfChanged(OUTPUT, svg);
  console.log(`${dataChanged ? 'updated  ' : 'unchanged'} ${SNAPSHOT}`);
  console.log(`${svgChanged ? 'updated  ' : 'unchanged'} ${OUTPUT} (${snapshot.total} contributions, ${snapshot.days.length} days)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
