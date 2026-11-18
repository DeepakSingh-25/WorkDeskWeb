// Generates src/assets/css/dark-auto.css: night-mode overrides for every colour that is
// hard-coded in the app's CSS (src/assets/css/*.css and component .css files).
//
//   node scripts/generate-dark-theme.js
//
// Re-run it after adding or changing styles. Hand-tuned overrides live in
// src/assets/css/dark.css, which is imported after this file and wins over it.
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src/assets/css/dark-auto.css');
const SKIP = new Set(['bootstrap.min.css', 'dark.css', 'dark-auto.css']);
const DARK = 'html[data-theme="dark"]';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.css') && !SKIP.has(e.name)) out.push(p);
  }
  return out;
}

// ---------- colour helpers ----------
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;

function parse(tok) {
  const t = tok.toLowerCase();
  if (NAMED[t]) return NAMED[t].slice();
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    n.push(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
    return n;
  }
  const m = t.match(/rgba?\(([^)]*)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  if (p.length < 3 || p.some(isNaN)) return null;
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

const r1 = n => Math.round(n * 10) / 10;
const hsl = (h, s, l, a = 1) => a < 1 ? `hsla(${r1(h)}, ${r1(s)}%, ${r1(l)}%, ${r1(a * 100) / 100})` : `hsl(${r1(h)}, ${r1(s)}%, ${r1(l)}%)`;
const NEUTRAL_H = 222; // the theme's blue-grey

// Each mapper returns a replacement string, or null to keep the colour as is.
function mapBg(c) {
  const [r, g, b, a] = c;
  if (a === 0) return null;
  if (r + g + b === 0 && a < 0.5) return `rgba(255, 255, 255, ${a})`; // black hover tint -> white tint
  let [h, s, l] = toHsl(c);
  if (l < 80) return null; // saturated/dark fills (buttons, badges) keep their colour
  if (a < 0.5) return null;
  if (s < 8 || l > 98.5) { h = NEUTRAL_H; s = Math.max(s, 25); }
  if (l > 98.5) return hsl(h, 28, 14.5, a);        // white surfaces -> card
  return hsl(h, Math.min(s, 45), 9 + (100 - l) * 0.9, a); // light tints -> dark tints (page bg is darkest)
}

function mapText(c) {
  const [r, g, b, a] = c;
  if (r + g + b === 0) return `rgba(226, 232, 245, ${a})`; // black (or black alpha) text
  const [h, s, l] = toHsl(c);
  if (l > 85) return null;                                // already light
  if (s < 30) return hsl(s < 8 ? NEUTRAL_H : h, Math.min(s, 18), l < 40 ? 90 - l * 0.4 : Math.min(80, l + 24), a);
  return l < 64 ? hsl(h, Math.min(s, 90), 66, a) : null;  // brand/status colours: lift for contrast
}

function mapBorder(c) {
  const [r, g, b, a] = c;
  if (r + g + b === 0) return `rgba(255, 255, 255, ${Math.min(1, a * 1.2)})`;
  let [h, s, l] = toHsl(c);
  if (l < 75 || a < 0.3) return null;
  if (s < 8) { h = NEUTRAL_H; s = 25; }
  return hsl(h, Math.min(s, 35), 20 + (100 - l) * 0.35, a);
}

function kindOf(prop) {
  prop = prop.toLowerCase();
  if (prop.startsWith('--')) {
    if (/bg|background|surface/.test(prop)) return 'bg';
    if (/border|line/.test(prop)) return 'border';
    if (/text|color/.test(prop)) return 'text';
    return null;
  }
  if (prop === 'background' || prop === 'background-color' || prop === 'background-image') return 'bg';
  if (prop === 'color' || prop === '-webkit-text-fill-color' || prop === 'caret-color') return 'text';
  if (prop.startsWith('border') || prop === 'outline' || prop === 'outline-color') return 'border';
  return null;
}
const MAP = { bg: mapBg, text: mapText, border: mapBorder };

function convert(prop, value) {
  const kind = kindOf(prop);
  if (!kind || value.includes('var(')) return null;
  let changed = false;
  const out = value.replace(COLOR_RE, tok => {
    const c = parse(tok);
    const m = c && MAP[kind](c);
    if (m) { changed = true; return m; }
    return tok;
  });
  return changed ? out : null;
}

// ---------- selectors ----------
function scope(sel) {
  sel = sel.trim().replace(/::ng-deep\s*/g, '').replace(/:host-context\([^)]*\)\s*/g, '').replace(/:host\b\s*/g, '').trim();
  if (!sel) return null;
  if (/^(:root|html)\b/.test(sel)) return sel.replace(/^(:root|html)/, DARK);
  return `${DARK} ${sel}`;
}

// ---------- main ----------
const files = walk(path.join(ROOT, 'src/assets/css')).concat(walk(path.join(ROOT, 'src/app')));
const outRoot = postcss.root();
let ruleCount = 0;

for (const file of files) {
  let root;
  try { root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file }); }
  catch (e) { console.warn('skip (parse error):', path.relative(ROOT, file), e.reason); continue; }

  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const chunk = [];
  root.walkRules(rule => {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const decls = [];
    rule.each(d => {
      if (d.type !== 'decl') return;
      const v = convert(d.prop, d.value);
      if (v) decls.push(postcss.decl({ prop: d.prop, value: v, important: d.important }));
    });
    if (!decls.length) return;
    const selectors = rule.selectors.map(scope).filter(Boolean);
    if (!selectors.length) return;
    let node = postcss.rule({ selectors });
    decls.forEach(d => node.append(d));
    // keep @media / @supports wrappers
    for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) {
      const at = postcss.atRule({ name: p.name, params: p.params });
      at.append(node);
      node = at;
    }
    chunk.push(node);
    ruleCount++;
  });
  if (chunk.length) {
    outRoot.append(postcss.comment({ text: ` ${rel} ` }));
    chunk.forEach(n => outRoot.append(n));
  }
}

const header = '/* AUTO-GENERATED by scripts/generate-dark-theme.js - do not edit by hand.\n   Put manual night-mode fixes in dark.css instead. */\n';
fs.writeFileSync(OUT, header + outRoot.toString().replace(/\n{3,}/g, '\n\n') + '\n');
console.log(`dark-auto.css: ${ruleCount} rules from ${files.length} files`);
