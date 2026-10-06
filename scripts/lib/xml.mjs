// Minimal XML well-formedness checker (tags, attributes, entities).
// Enough to catch generator mistakes without pulling in a parser dependency.
const NAME = /^[A-Za-z_:][\w.:-]*$/;
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/y;

export function checkXml(src) {
  const errors = [];
  const stack = [];
  let roots = 0;
  let i = 0;
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  const fail = (pos, msg) => errors.push(`line ${lineOf(pos)}: ${msg}`);

  const checkText = (from, to) => {
    for (let p = src.indexOf('&', from); p !== -1 && p < to; p = src.indexOf('&', p + 1)) {
      ENTITY.lastIndex = p;
      if (!ENTITY.test(src)) fail(p, 'unescaped "&"');
    }
  };

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const end = lt === -1 ? src.length : lt;
    if (stack.length === 0 && src.slice(i, end).trim()) fail(i, 'text outside root element');
    checkText(i, end);
    if (lt === -1) break;

    if (src.startsWith('<!--', lt)) {
      const close = src.indexOf('-->', lt + 4);
      if (close === -1) return [...errors, `line ${lineOf(lt)}: unterminated comment`];
      i = close + 3;
    } else if (src.startsWith('<?', lt)) {
      const close = src.indexOf('?>', lt + 2);
      if (close === -1) return [...errors, `line ${lineOf(lt)}: unterminated processing instruction`];
      i = close + 2;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const close = src.indexOf(']]>', lt);
      if (close === -1) return [...errors, `line ${lineOf(lt)}: unterminated CDATA`];
      i = close + 3;
    } else if (src.startsWith('<!', lt)) {
      fail(lt, 'DOCTYPE/declarations are not allowed');
      i = src.indexOf('>', lt) + 1 || src.length;
    } else {
      const close = findTagEnd(src, lt);
      if (close === -1) return [...errors, `line ${lineOf(lt)}: unterminated tag`];
      const raw = src.slice(lt + 1, close);
      if (raw.startsWith('/')) {
        const name = raw.slice(1).trim();
        const open = stack.pop();
        if (open !== name) fail(lt, `closing </${name}> does not match <${open ?? 'nothing'}>`);
      } else {
        const selfClosing = raw.endsWith('/');
        const body = selfClosing ? raw.slice(0, -1) : raw;
        const name = body.match(/^[^\s/>]+/)?.[0] ?? '';
        if (!NAME.test(name)) fail(lt, `invalid tag name "${name}"`);
        checkAttributes(body.slice(name.length), (msg) => fail(lt, `<${name}> ${msg}`));
        if (stack.length === 0) roots++;
        if (!selfClosing) stack.push(name);
      }
      i = close + 1;
    }
  }
  if (stack.length) errors.push(`unclosed elements: ${stack.join(' > ')}`);
  if (roots !== 1) errors.push(`expected exactly one root element, found ${roots}`);
  return errors;
}

function findTagEnd(src, from) {
  let quote = null;
  for (let p = from + 1; p < src.length; p++) {
    const ch = src[p];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '<') return -1;
    else if (ch === '>') return p;
  }
  return -1;
}

function checkAttributes(text, fail) {
  const seen = new Set();
  const re = /\s+([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')|\s+(\S+)/gy;
  let m;
  let pos = 0;
  re.lastIndex = 0;
  while (pos < text.length && (m = re.exec(text))) {
    pos = re.lastIndex;
    if (m[5]) {
      if (m[5].trim()) fail(`malformed attribute "${m[5]}"`);
      continue;
    }
    const [, name, , dq, sq] = m;
    if (!NAME.test(name)) fail(`invalid attribute name "${name}"`);
    if (seen.has(name)) fail(`duplicate attribute "${name}"`);
    seen.add(name);
    const value = dq ?? sq;
    if (value.includes('<')) fail(`"<" in attribute ${name}`);
    for (const amp of value.matchAll(/&/g)) {
      ENTITY.lastIndex = 0;
      if (!ENTITY.test(value.slice(amp.index))) fail(`unescaped "&" in attribute ${name}`);
    }
  }
  if (!/^\s*$/.test(text.slice(pos))) {
    fail('unparseable attributes');
  }
}
