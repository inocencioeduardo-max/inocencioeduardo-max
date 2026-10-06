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
