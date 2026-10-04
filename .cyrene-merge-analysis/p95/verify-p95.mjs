import fs from 'node:fs';
import path from 'node:path';

const repo = 'E:/AI_Chating/cyrene-agent';
const react = path.join(repo, 'src/renderer/react');

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

// ─────────── 1. CSS 已定义类名 ───────────
const cssFiles = walk(react, '.css');
const defined = new Set();
for (const f of cssFiles) {
  const t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
  for (const m of t.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) defined.add(m[1]);
}
console.log(`[1] CSS 文件 = ${cssFiles.length}   已定义类名 = ${defined.size}`);

// ─────────── 2. 面板 TSX 的类名使用（独立实现，不用执行者的 scanner） ───────────
const panels = [
  'features/settings/memory-console/MemoryManagerSection.tsx',
  'features/settings/memory-console/DangerZoneSection.tsx',
  'features/settings/ZonesSettingsPanel.tsx',
];
const interesting = /^(cy-|memory-manager|zone)/;
for (const rel of panels) {
  const src = fs.readFileSync(path.join(react, rel), 'utf8');
  const used = new Set();
  for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|\{([\s\S]*?)\})/g)) {
    const body = m[1] ?? m[2] ?? '';
    for (const q of body.matchAll(/"([^"]*)"/g))
      for (const tok of q[1].split(/\s+/)) if (/^[A-Za-z][\w-]*$/.test(tok)) used.add(tok);
    for (const q of body.matchAll(/`([^`]*)`/g)) {
      const frag = q[1].replace(/\$\{[^}]*\}/g, ' ');
      for (const tok of frag.split(/\s+/)) if (/^[A-Za-z][\w-]*$/.test(tok)) used.add(tok);
    }
  }
  const mine = [...used].filter((c) => interesting.test(c)).sort();
  const undef = mine.filter((c) => !defined.has(c));
  console.log(`\n=== ${rel}\n    相关类名 ${mine.length}   未定义 ${undef.length}`);
  undef.forEach((u) => console.log(`    UNDEFINED  ${u}`));
}

// ─────────── 3. 旧 settings.css 的规则解析（brace-aware） ───────────
function parseRules(text) {
  const out = [];
  const stack = [];
  let selStart = 0;
  let mediaDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const sel = text.slice(selStart, i).trim();
      const isMedia = sel.startsWith('@');
      stack.push({ sel, isMedia, bodyStart: i + 1, media: mediaDepth > 0 });
      if (isMedia) mediaDepth++;
      selStart = i + 1;
    } else if (ch === '}') {
      const top = stack.pop();
      if (top) {
        if (top.isMedia) mediaDepth--;
        else out.push({ sel: top.sel, body: text.slice(top.bodyStart, i), media: top.media });
      }
      selStart = i + 1;
    }
  }
  return out;
}
function props(body) {
  const s = new Set();
  for (const m of body.matchAll(/(?:^|;)\s*([-a-zA-Z]+)\s*:/g)) s.add(m[1].toLowerCase());
  return s;
}
function toMap(rules) {
  const map = new Map();
  const media = new Set();
  for (const r of rules) {
    for (const part of r.sel.split(',')) {
      const k = part.replace(/\s+/g, ' ').trim();
      if (!k) continue;
      if (!map.has(k)) map.set(k, new Set());
      for (const p of props(r.body)) map.get(k).add(p);
      if (r.media) media.add(k);
    }
  }
  return { map, media };
}

const oldCss = fs.readFileSync(path.join(repo, '.cyrene-merge-analysis/p95/old-settings.css'), 'utf8').replace(/^\uFEFF/, '');
const newA = fs.readFileSync(path.join(react, 'features/settings/memory-console/MemoryConsole.css'), 'utf8');
const newB = fs.readFileSync(path.join(react, 'features/settings/ZonesPanel.css'), 'utf8');

const oldRules = parseRules(oldCss);
const old = toMap(oldRules);
const newM = toMap(parseRules(newA + '\n' + newB));
console.log(`\n[3] 旧 settings.css: 规则块 ${oldRules.length}  选择器(拆分后) ${old.map.size}`);
console.log(`    新两文件:        规则块 ${parseRules(newA + '\n' + newB).length}  选择器(拆分后) ${newM.map.size}`);

const pat = /memory-manager|zone/;
const oldKeys = [...old.map.keys()].filter((k) => pat.test(k)).sort();
const newKeys = [...newM.map.keys()].filter((k) => pat.test(k)).sort();
console.log(`    旧 CSS 命中该族选择器 = ${oldKeys.length}（其中位于 @media 内 = ${oldKeys.filter((k) => old.media.has(k)).length}）`);
console.log(`    新 CSS 命中该族选择器 = ${newKeys.length}`);

const missing = oldKeys.filter((k) => !newM.map.has(k));
console.log(`\n[4] 旧有新无（丢失）= ${missing.length}`);
missing.forEach((k) => console.log(`    - ${k}${old.media.has(k) ? '   [旧@media内]' : ''}`));

const lost = [];
for (const k of oldKeys) {
  if (!newM.map.has(k)) continue;
  const l = [...old.map.get(k)].filter((p) => !newM.map.get(k).has(p));
  if (l.length) lost.push(`${k}  → 缺 ${l.join(',')}`);
}
console.log(`\n[5] 属性名缺失的选择器 = ${lost.length}`);
lost.forEach((l) => console.log(`    ${l}`));

const added = newKeys.filter((k) => !old.map.has(k));
console.log(`\n[6] 旧无新有（新增）= ${added.length}`);
added.forEach((k) => console.log(`    + ${k}`));

// ─────────── 7. 新 CSS 的颜色/令牌卫生 ───────────
const tokDef = new Set();
for (const f of [...walk(react, '.css'), ...walk(react, '.ts'), ...walk(react, '.tsx')]) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/(--rb-[a-zA-Z0-9-]+)\s*:/g)) tokDef.add(m[1]);
  for (const m of t.matchAll(/["'](--rb-[a-zA-Z0-9-]+)["']\s*:/g)) tokDef.add(m[1]);
}
console.log(`\n[7] 全仓定义过的 --rb-* 令牌 = ${tokDef.size}`);
for (const [name, txt] of [['MemoryConsole.css', newA], ['ZonesPanel.css', newB]]) {
  const hex = [...txt.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length;
  const rgba = [...txt.matchAll(/rgba?\(/g)].length;
  const cy = [...txt.matchAll(/var\(--cy-/g)].length;
  const used = new Set([...txt.matchAll(/var\((--rb-[a-zA-Z0-9-]+)/g)].map((m) => m[1]));
  const undefTok = [...used].filter((t) => !tokDef.has(t)).sort();
  console.log(`    ${name}: 花括号 ${(txt.match(/\{/g) || []).length}/${(txt.match(/\}/g) || []).length}  hex=${hex} rgba=${rgba} var(--cy-=${cy}  用到令牌=${used.size}  未定义令牌=${undefTok.length}`);
  undefTok.forEach((t) => console.log(`       NO-DEF TOKEN ${t}`));
}
