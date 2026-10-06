// Shared helpers for the profile SVG generators. No external dependencies.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Palette: dark surface, restrained cyan/green accents.
export const theme = {
  bg: '#0b1117',
  panel: '#0f1720',
  border: '#1f2b37',
  grid: '#13202b',
  text: '#e6edf3',
  muted: '#8b98a5',
  dim: '#5b6875',
  cyan: '#5ccfe6',
  green: '#7ee2a8',
  // Heatmap ramp, level 0..4
  levels: ['#151d26', '#0f3d3a', '#13695a', '#22a27a', '#5fe0a3'],
};

export const MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
export const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

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
