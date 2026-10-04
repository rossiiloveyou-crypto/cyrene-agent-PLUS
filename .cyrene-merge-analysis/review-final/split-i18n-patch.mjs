// 把 i18n 的 diff 按「新增键归属哪个主题」拆成两个 patch：
//   A = H-22 擦除弹窗（previewContinue / confirmBack）
//   B = 控制台关键词策略（keywords* / interceptKeywords* / triggerKeywords*）
// 用法：node split-i18n-patch.mjs <in.patch> <outA.patch> <outB.patch>
import fs from 'node:fs';

const [, , inFile, outA, outB] = process.argv;
// 🔴 PS 5.1 的 Out-File -Encoding utf8 会写 BOM → 首个 "diff --git" 行会变成 "\uFEFFdiff --git"
// （经验库具体坑 D17 / X18 同族）→ 解析前必须先剥掉
const lines = fs.readFileSync(inFile, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);

const sections = [];
let cur = null;
for (const ln of lines) {
  if (ln.startsWith('diff --git ')) {
    if (cur) sections.push(cur);
    cur = { header: [ln], hunks: [] };
  } else if (!cur) {
    continue;
  } else if (ln.startsWith('@@')) {
    cur.hunks.push([ln]);
  } else if (cur.hunks.length === 0) {
    cur.header.push(ln);
  } else {
    cur.hunks[cur.hunks.length - 1].push(ln);
  }
}
if (cur) sections.push(cur);

const isA = (hunk) => hunk.some((l) => /previewContinue|confirmBack/.test(l));
const build = (sections, pick) =>
  sections
    .map((s) => {
      const hs = s.hunks.filter(pick);
      if (hs.length === 0) return '';
      return [...s.header, ...hs.flat()].join('\n') + '\n';
    })
    .join('');

fs.writeFileSync(outA, build(sections, isA));
fs.writeFileSync(outB, build(sections, (h) => !isA(h)));

console.log(
  'sections=' + sections.length,
  '| A(H-22) hunks=' + sections.map((s) => s.hunks.filter(isA).length).join(','),
  '| B(关键词) hunks=' + sections.map((s) => s.hunks.filter((h) => !isA(h)).length).join(','),
);
