// Shared helpers for the profile SVG generators. No external dependencies.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Palette: GitHub-dark terminal surface with green accents.
export const theme = {
  bg: '#0d1117',
  border: '#30363d',
  bar: '#161b22',
  text: '#e6edf3',
  muted: '#8b949e',
  dim: '#484f58',
  green: '#3fb950',
  bright: '#56d364',
  ascii: '#c9d1d9',
  // Heatmap ramp, level 0..4 (GitHub's dark-mode greens)
  levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
};

export const MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Animations declare their *final* state as the default and animate from a
// hidden state with fill-mode "both". If a renderer ignores CSS animation, or
// the viewer prefers reduced motion, the readable final frame is shown.
export const REDUCED_MOTION =
  '@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }';

export function svgDoc({ width, height, title, desc, style, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title>
<desc id="desc">${esc(desc)}</desc>
<style>
${style.trim()}
${REDUCED_MOTION}
</style>
${body.trim()}
</svg>
`;
}

export function readJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
}

// Writes only when content differs, so regenerated assets never create empty diffs.
export function writeIfChanged(relPath, content) {
  const file = join(ROOT, relPath);
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return true;
}

// Terminal window frame: border, title bar and three muted dots.
export function windowChrome(width, height, label) {
  return `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="${theme.bg}" stroke="${theme.border}"/>
<path d="M1 28.5 H${width - 1}" stroke="${theme.border}"/>
<circle cx="16" cy="14.5" r="4.5" fill="${theme.dim}"/>
<circle cx="31" cy="14.5" r="4.5" fill="${theme.dim}"/>
<circle cx="46" cy="14.5" r="4.5" fill="${theme.dim}"/>
<text x="${width / 2}" y="18.5" text-anchor="middle" font-size="11" fill="${theme.muted}">${esc(label)}</text>`;
}

export const CHAR = 0.6; // approximate monospace advance, in em
