// 旧设置子树 src/renderer/settings/** 的「活/死」判定：谁从子树外引用它？
import fs from 'node:fs';
import path from 'node:path';

const repo = 'E:/AI_Chating/cyrene-agent';
const SRC = path.join(repo, 'src');
const SUB = path.join(SRC, 'renderer/settings');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const all = walk(SRC);
const inSub = all.filter((f) => f.startsWith(SUB + path.sep));
const outSub = all.filter((f) => !f.startsWith(SUB + path.sep));

// 收集子树内所有模块的「可被引用的相对路径集合」
const subRel = new Set(inSub.map((f) => path.relative(SRC, f).replace(/\\/g, '/').replace(/\.tsx?$/, '')));

const referrers = new Map(); // subRel -> Set(outside file)
const importRe = /(?:import|export)[\s\S]{0,400}?from\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const abs = path.resolve(path.dirname(fromFile), spec);
  const rel = path.relative(SRC, abs).replace(/\\/g, '/');
  return rel.replace(/\.tsx?$/, '');
}

for (const f of outSub) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(importRe)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    const rel = resolveImport(f, spec);
    if (rel && subRel.has(rel)) {
      if (!referrers.has(rel)) referrers.set(rel, new Set());
      referrers.get(rel).add(path.relative(repo, f).replace(/\\/g, '/'));
    }
  }
}

console.log(`子树内 .ts/.tsx = ${inSub.length}；子树外被引用的模块 = ${referrers.size}`);
for (const [mod, refs] of [...referrers].sort()) {
  console.log(`  ✔ ${mod}`);
  for (const r of refs) console.log(`       ← ${r}`);
}

// 子树内部是否自成一个闭合图（内部互相 import 的规模）
let internalEdges = 0;
for (const f of inSub) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(importRe)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    const rel = resolveImport(f, spec);
    if (rel && subRel.has(rel)) internalEdges++;
  }
}
console.log(`\n子树内部的 import 边数 = ${internalEdges}`);

// 子树里带 .test.ts 的文件（在不在测试扫描面内）
const tests = inSub.filter((f) => /\.test\.tsx?$/.test(f));
console.log(`子树内的测试文件 = ${tests.length}`);
for (const t of tests) console.log(`  · ${path.relative(repo, t).replace(/\\/g, '/')}`);
