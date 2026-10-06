// Writes preview/index.html: the README rendered with GitHub-like dark styling,
// shown at desktop and phone widths. Approximates GitHub's renderer for the
// Markdown subset this README uses; it's for local design review only.
// Usage: node scripts/preview.mjs, then open preview/index.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/svg.mjs';

const md = readFileSync(join(ROOT, 'README.md'), 'utf8').replace(/<!--[\s\S]*?-->\n?/g, '');

const inline = (s) =>
  s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/src="assets\//g, 'src="../assets/');

function toHtml(src) {
  const out = [];
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    para = [];
    list = null;
  };
  for (const line of src.split('\n')) {
    const h = line.match(/^(#{1,3}) (.*)/);
    if (h) {
      flush();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (line.startsWith('- ')) {
      if (para.length) flush();
      (list ??= []).push(line.slice(2));
    } else if (line.startsWith('> ')) {
      flush();
      out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
    } else if (line.startsWith('<')) {
      flush();
      out.push(inline(line));
    } else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return out.join('\n');
}

const readme = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>README preview</title>
<style>
body { margin: 0; background: #0d1117; color: #e6edf3; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
article { max-width: 838px; margin: 0 auto; padding: 24px 16px 48px; }
h2 { font-size: 1.5em; border-bottom: 1px solid #3d444d; padding-bottom: .3em; margin: 24px 0 16px; }
h3 { font-size: 1.25em; margin: 24px 0 16px; }
p, ul, blockquote { margin: 0 0 16px; }
ul { padding-left: 2em; }
a { color: #4493f8; text-decoration: none; }
code { background: #656c7633; padding: .2em .4em; border-radius: 6px; font-size: 85%; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
blockquote { color: #9198a1; border-left: .25em solid #3d444d; padding: 0 1em; }
img { max-width: 100%; height: auto; }
</style></head><body><article>
${toHtml(md)}
</article></body></html>`;

const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Profile preview</title>
<style>
body { margin: 0; background: #010409; color: #9198a1; font: 13px/1.4 ui-monospace, Menlo, Consolas, monospace; }
main { display: flex; gap: 32px; padding: 24px; align-items: flex-start; flex-wrap: wrap; justify-content: center; }
figure { margin: 0; }
figcaption { margin-bottom: 8px; }
iframe { border: 1px solid #3d444d; border-radius: 8px; background: #0d1117; height: 2000px; }
</style></head><body><main>
<figure><figcaption>desktop · 900px</figcaption><iframe src="readme.html" width="900" title="Desktop preview"></iframe></figure>
<figure><figcaption>phone · 390px</figcaption><iframe src="readme.html" width="390" title="Phone preview"></iframe></figure>
</main></body></html>`;

mkdirSync(join(ROOT, 'preview'), { recursive: true });
writeFileSync(join(ROOT, 'preview', 'readme.html'), readme);
writeFileSync(join(ROOT, 'preview', 'index.html'), index);
console.log(`wrote ${join(ROOT, 'preview', 'index.html')}`);
