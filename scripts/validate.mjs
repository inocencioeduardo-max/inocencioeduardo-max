// Validates generated SVGs and README references.
// Usage: node scripts/validate.mjs [--links]   (--links also checks external URLs)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson } from './lib/svg.mjs';
import { checkXml } from './lib/xml.mjs';

const problems = [];
const report = (where, msg) => problems.push(`${where}: ${msg}`);

// 1. SVG assets: well-formed, accessible, self-contained, small.
const FORBIDDEN = [
  [/<script\b/i, '<script> is not allowed'],
  [/<foreignObject\b/i, '<foreignObject> is not rendered by GitHub'],
  [/\son[a-z]+\s*=/i, 'event handler attributes are not allowed'],
  [/\bhref\s*=\s*["'](?!#)/i, 'external href (assets must be self-contained)'],
  [/@import|url\(\s*["']?(?!#)/i, 'external CSS resource'],
];

const svgs = readdirSync(join(ROOT, 'assets')).filter((f) => f.endsWith('.svg'));
for (const file of svgs) {
  const rel = `assets/${file}`;
  const src = readFileSync(join(ROOT, rel), 'utf8');
  for (const err of checkXml(src)) report(rel, err);
  for (const [re, msg] of FORBIDDEN) if (re.test(src)) report(rel, msg);
  if (!/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(src)) report(rel, 'missing svg namespace');
  if (!/viewBox="/.test(src)) report(rel, 'missing viewBox');
  if (!/role="img"/.test(src) || !/<title[^>]*>[^<]+<\/title>/.test(src)) report(rel, 'missing role="img" or <title>');
  if (/@keyframes/.test(src) && !/prefers-reduced-motion/.test(src)) report(rel, 'missing reduced-motion fallback');
  const kb = statSync(join(ROOT, rel)).size / 1024;
  if (kb > 150) report(rel, `too large (${kb.toFixed(0)} KB)`);
}

// 2. Snapshot sanity.
const snap = readJson('data/contributions.json');
const sum = snap.days.reduce((s, d) => s + d.count, 0);
if (sum !== snap.total) report('data/contributions.json', `total ${snap.total} != sum ${sum}`);

// 3. README: images are local with alt text; collect links.
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
for (const tag of readme.match(/<img\b[^>]*>/g) ?? []) {
  const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
  const alt = tag.match(/\balt="([^"]*)"/)?.[1];
  if (!alt || alt.trim().length < 10) report('README.md', `image ${src} needs descriptive alt text`);
  if (!src || /^https?:/.test(src)) report('README.md', `image ${src} must be a local asset`);
  else if (!existsSync(join(ROOT, src))) report('README.md', `image ${src} does not exist`);
}
const links = [...readme.matchAll(/\]\((https?:\/\/[^)\s]+)\)|href="(https?:\/\/[^"]+)"/g)].map((m) => m[1] ?? m[2]);

if (process.argv.includes('--links')) {
  for (const url of new Set(links)) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'profile-readme-link-check' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status >= 400) report('README.md', `link ${url} returned HTTP ${res.status}`);
      else console.log(`ok    ${res.status} ${url}`);
    } catch (err) {
      report('README.md', `link ${url} failed: ${err.message}`);
    }
  }
}

console.log(`checked ${svgs.length} SVGs, ${links.length} README links${process.argv.includes('--links') ? ' (live)' : ''}`);
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('✓ all checks passed');
