// Parser/renderer tests. Usage: node --test scripts/test.mjs
// Fixtures here are synthetic test inputs only; they are never written to assets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, render } from './build-contributions.mjs';
import { checkXml } from './lib/xml.mjs';

function fixture(counts, { heading } = {}) {
  const start = Date.parse('2025-10-05T00:00:00Z');
  let cells = '';
  let tips = '';
  counts.forEach((n, i) => {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const level = n === 0 ? 0 : Math.min(4, Math.ceil(n / 3));
    cells += `<td tabindex="0" data-ix="${i}" data-date="${date}" id="contribution-day-component-${i % 7}-${i}" data-level="${level}" class="ContributionCalendar-day"></td>`;
    const label = n === 0 ? 'No contributions' : `${n.toLocaleString('en-US')} contribution${n === 1 ? '' : 's'}`;
    tips += `<tool-tip id="t${i}" for="contribution-day-component-${i % 7}-${i}" popover="manual">${label} on October 5th.</tool-tip>`;
  });
  const total = heading ?? counts.reduce((a, b) => a + b, 0);
  return `<h2 id="js-contribution-activity-description" class="f4">\n  ${total}\n  contributions\n in the last year</h2><table>${cells}</table>${tips}`;
}

const year = (fn) => Array.from({ length: 366 }, (_, i) => fn(i));

test('parses dates, levels and counts', () => {
  const counts = year((i) => (i % 10 === 0 ? (i === 0 ? 1200 : 2) : 0));
  const { total, days } = parseCalendar(fixture(counts));
  assert.equal(days.length, 366);
  assert.equal(days[0].date, '2025-10-05');
  assert.equal(days[0].count, 1200);
  assert.equal(days[0].level, 4);
  assert.equal(total, counts.reduce((a, b) => a + b, 0));
});

test('rejects markup without a calendar', () => {
  assert.throws(() => parseCalendar('<html><body>Rate limited</body></html>'), /expected ~1 year/);
});

test('rejects cells whose count is missing', () => {
  const html = fixture(year(() => 0)).replace(/<tool-tip[^>]*for="contribution-day-component-0-7"[^>]*>[^<]*<\/tool-tip>/, '');
  assert.throws(() => parseCalendar(html), /missing count/);
});

test('rejects count/level disagreement', () => {
  const html = fixture(year(() => 0)).replace('data-level="0"', 'data-level="3"');
  assert.throws(() => parseCalendar(html), /mismatch/);
});

test('renders well-formed SVG, including the empty state', () => {
  for (const fill of [() => 0, (i) => i % 4]) {
    const { total, days } = parseCalendar(fixture(year(fill)));
    const svg = render({ username: 'octo', title: 'public contributions', total, days });
    assert.deepEqual(checkXml(svg), []);
    assert.equal((svg.match(/class="c /g) ?? []).length, 366);
    if (total === 0) assert.match(svg, /No public contributions in this period yet/);
  }
});

test('xml checker catches common mistakes', () => {
  assert.notDeepEqual(checkXml('<svg><g></svg>'), []);
  assert.notDeepEqual(checkXml('<svg><text>A & B</text></svg>'), []);
  assert.notDeepEqual(checkXml('<svg a="1" a="2"/>'), []);
  assert.deepEqual(checkXml('<svg a="1"><text>A &amp; B</text></svg>'), []);
});

test('derives streaks and best day only from parsed days', async () => {
  const { stats } = await import('./build-contributions.mjs');
  const days = [0, 2, 3, 0, 1, 1, 1, 0, 5, 4].map((count, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, count }));
  // Last day is non-zero, so the current streak counts back from it.
  assert.deepEqual(stats(days), { active: 7, longest: 3, current: 2, best: days[8] });
  // A zero "today" doesn't break a streak that ran through yesterday.
  assert.equal(stats([...days, { date: '2026-01-11', count: 0 }]).current, 2);
  assert.deepEqual(stats(days.map((d) => ({ ...d, count: 0 }))), { active: 0, longest: 0, current: 0, best: null });
});

test('decodes PNGs and maps brightness to the glyph ramp', async () => {
  const { deflateSync } = await import('node:zlib');
  const { decodePng, toAscii, RAMP } = await import('./build-portrait.mjs');
  // 40x40 grayscale PNG: dark background with a bright square in the middle.
  const size = 40;
  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw[y * (size + 1) + 1 + x] = x >= 10 && x < 30 && y >= 10 && y < 30 ? 240 : 10;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const img = decodePng(png);
  assert.equal(img.width, size);
  assert.ok(img.lum[0] < 0.1 && img.lum[20 * size + 20] > 0.9);

  const lines = toAscii(img, { columns: 10, rows: 10, cellAspect: 1 }, { sharpen: 0 }).split('\n');
  assert.equal(lines.length, 10);
  assert.equal(lines[0].trim(), ''); // background knocked out
  assert.equal(lines[5][5], RAMP.at(-1)); // bright subject → densest glyph
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
});

test('limits the heatmap to the configured trailing months', async () => {
  const { lastMonths, render } = await import('./build-contributions.mjs');
  const { days } = parseCalendar(fixture(year((i) => (i === 365 ? 3 : i === 10 ? 2 : 0))));
  const six = lastMonths(days, 6);
  assert.equal(six.at(-1).date, days.at(-1).date);
  assert.ok(six.length >= 181 && six.length <= 184, `got ${six.length} days`);
  assert.equal(lastMonths(days, 12), days);
  const svg = render({ username: 'octo', title: 'public contributions', days, months: 6 });
  assert.deepEqual(checkXml(svg), []);
  assert.match(svg, /3 contributions in the last 6 months/); // the early 2-count day is outside the window
});
