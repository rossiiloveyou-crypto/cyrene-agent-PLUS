#!/usr/bin/env node
// P10 T2 · 把 P8.5 的 Bucket2（79 条）**机械归类**成"有意放弃清单"的逐条台账
//
// 为什么要机械：79 条路径手抄必然出错，而本任务的判据是"逐条可追溯"（A4）。
// 本脚本的输入是 P8.5 的权威底稿（`.cyrene-merge-analysis/p8/p8-parity-bucket2.txt`），
// 输出是可直接贴进 `ABANDONED-有意放弃清单.md` 的 markdown 表格 + 分类计数。
//
// 用法（仓库根）：node .cyrene-merge-analysis/p10/bucket2-classify.mjs

import { readFileSync, writeFileSync } from "node:fs";

const SRC = ".cyrene-merge-analysis/p8/p8-parity-bucket2.txt";
const OUT = ".cyrene-merge-analysis/p10/bucket2-table.md";

/** 还原 git quotepath 的八进制转义（`"docs/merge-plan/00-\346\200\273..."` → 真中文路径）。 */
function unquote(raw) {
  let text = raw.trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
    text = text.replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
  }
  return text;
}

/**
 * 归类规则（**只依赖路径本身**，所以任何人复跑都得到同一结果）。
 * 类别编号与 `ABANDONED-有意放弃清单.md` §四 一致。
 */
function classify(path) {
  if (path.startsWith(".cyrene-merge-analysis/")) {
    return { code: "⑦", name: "过程产物（证据目录）", note: "本就不入库；合并期间被脚本更新/新增" };
  }
  if (path.startsWith("docs/")) {
    const dir = path.split("/")[1];
    const d6 = { design: "docs/design", "internal-issue": "docs/internal-issue", refactor: "docs/refactor", superpowers: "docs/superpowers", "merge-plan": "docs/merge-plan" }[dir] ?? `docs/${dir}`;
    return { code: "⑥", name: "文档级放弃（D6）", note: `D6：任何文档不进合并提交（${d6}）` };
  }
  if (path === "src/main/channels/group-context-flow.test.ts") {
    return { code: "⑧", name: "显式交付物（非放弃）", note: "P6 蓝图新建的静默失效探测器（4 tests，已突变验证）" };
  }
  if (path === "src/shared/usage-badge.ts" || path === "src/shared/usage-badge.test.ts") {
    return { code: "⑧", name: "显式交付物（非放弃）", note: "P5 蓝图 §4.2/§4.3 明确「新建」（用量徽章从被删文件抢救）" };
  }
  if (path === "src/renderer/settings/shared/modal-icon.test.ts") {
    return { code: "⑤", name: "有意保留但不接线", note: "12 个本地独有 settings 文件之一；P5 偏差 4 夹具复位（不改产品行为）" };
  }
  if (path === "src/renderer/react/features/chat/components/panel-layout.test.ts") {
    return { code: "③", name: "测试级放弃（H-07）", note: "**文件收窄**：只删 2 条读已删 ModelModePanel.css 的红用例，保留 4 条绿守卫（J-20）" };
  }
  if (path === "src/renderer/react/features/chat/components/api-config/api-config-source.test.ts") {
    return { code: "③", name: "测试级放弃（H-07）", note: "H-07 整文件删（`0 test`）；⚠️ 与被放弃的 **H-16 入口**同源（宿主 ModelModePanel 被官方重构删除）" };
  }
  if (path.includes(".test.ts")) {
    return { code: "③", name: "测试级放弃（H-07）", note: "H-07 整文件删（`0 test`，失去被测对象）" };
  }
  return null;
}

// 🔴 底稿首行带 UTF-8 BOM（`\uFEFF`）—— 不剥掉会让第一条路径匹配不上（实测：79 → 78 归类）
const lines = readFileSync(SRC, "utf8").replace(/^\uFEFF/, "").split("\n").map((line) => line.trimEnd()).filter(Boolean);
const rows = [];
const unclassified = [];
const counts = new Map();

for (const line of lines) {
  const match = /^([A-Z?!]{1,2})\t(.*)$/.exec(line);
  if (!match) { unclassified.push(line); continue; }
  const status = match[1];
  const path = unquote(match[2]);
  const bucket = classify(path);
  if (!bucket) { unclassified.push(`${status}\t${path}`); continue; }
  counts.set(bucket.code, (counts.get(bucket.code) ?? 0) + 1);
  rows.push({ status, path, ...bucket });
}

const table = [
  "| # | 路径 | 码 | 类别 | 依据（一句话） |",
  "|---|---|---|---|---|",
  ...rows.map((row, index) => `| ${index + 1} | \`${row.path}\` | \`${row.status}\` | **${row.code}** ${row.name} | ${row.note} |`),
].join("\n");

writeFileSync(OUT, `${table}\n`, "utf8");

process.stdout.write(`Bucket2 底稿行数 = ${lines.length}\n`);
process.stdout.write(`已归类 = ${rows.length} ｜ 未归类 = ${unclassified.length}\n`);
for (const [code, count] of [...counts.entries()].sort()) {
  process.stdout.write(`  类 ${code} : ${count}\n`);
}
if (unclassified.length > 0) {
  process.stdout.write(`\n🔴 未归类（必须为 0）：\n${unclassified.map((item) => `  ${item}`).join("\n")}\n`);
}
process.stdout.write(`\n表格已写入 ${OUT}\n`);
process.exit(unclassified.length === 0 && rows.length === lines.length ? 0 : 1);
