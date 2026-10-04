#!/usr/bin/env node
// P10 判据 A2 · 伪造"上游新提交"探针（可复跑）
//
// 目的：证明 `scripts/merge/upstream-sync.mjs` **真的能报出 RISK**，而不是"看起来没做事就报绿"。
// 手法（严格照 P10 蓝图 §四 4.1.2）：
//   ① 造一个**只改 1 个文件**的提交，父提交 = `refs/remotes/official/master`
//   ② 目标文件**必须落在 L_dev 里**（我们相对上游改过的路径）→ 交集非空才有意义
//   ③ 打到**临时 ref** `refs/remotes/official/probe`，绝不碰 `refs/heads/master`
//   ④ 用 `--ref` 指向它跑一次体检 → 期望 `RISK` 含该文件、**退出码 1**
//   ⑤ 跑完删掉临时 ref（不留痕）
//
// 🔴 只写**对象库**与**一个临时 ref**：全流程不 checkout、不碰工作区、不碰真实索引。
//    （`git mktree` 直接在 `ls-tree` 的原文上改一行 → 不需要 GIT_INDEX_FILE，也就不会误伤索引。）
//
// 用法（在仓库根）：node .cyrene-merge-analysis/p10/a2-probe.mjs

import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const UPSTREAM = "refs/remotes/official/master";
const PROBE = "refs/remotes/official/probe";
const SYNC_SCRIPT = "scripts/merge/upstream-sync.mjs";

function git(args, input) {
  return execFileSync("git", ["-C", ROOT, ...args], {
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitExit(args) {
  try {
    const out = execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (error) {
    return { code: typeof error.status === "number" ? error.status : 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

const problems = [];
const check = (ok, label) => {
  process.stdout.write(`${ok ? "  ✅" : "  ❌"} ${label}\n`);
  if (!ok) problems.push(label);
};

const headsBefore = git(["rev-parse", "refs/heads/master"]).trim();

process.stdout.write("① 选目标文件（必须是「我们改过」且「上游是根级 blob」的路径）\n");
const lDev = new Set(git(["diff", "--name-only", UPSTREAM, "HEAD"]).split("\n").map((s) => s.trim()).filter(Boolean));
const rootLines = git(["ls-tree", UPSTREAM]).split("\n").filter(Boolean);
let target = null;
for (const line of rootLines) {
  const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.+)$/.exec(line);
  if (!match || match[2] !== "blob") continue;
  if (!lDev.has(match[4])) continue;
  target = { mode: match[1], sha: match[3], name: match[4] };
  break;
}
if (!target) {
  process.stdout.write("  ❌ 找不到根级的 L_dev 文件，探针无法构造\n");
  process.exit(1);
}
process.stdout.write(`  目标 = ${target.name}（在 L_dev 里，${lDev.size} 条候选路径）\n\n`);

process.stdout.write("② 造 blob + 改写根树 + commit-tree（不碰工作区/索引）\n");
const newBlob = git(["hash-object", "-w", "--stdin"], `P10/A2 探针内容 —— 本 blob 只为伪造"上游改了 ${target.name}"而生。\n`).trim();
const patchedTreeLines = rootLines.map((line) => {
  const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.+)$/.exec(line);
  if (!match || match[4] !== target.name) return line;
  return `${match[1]} blob ${newBlob}\t${match[4]}`;
});
const newTree = git(["mktree"], `${patchedTreeLines.join("\n")}\n`).trim();
const upstreamCommit = git(["rev-parse", UPSTREAM]).trim();
const probeCommit = git(["commit-tree", newTree, "-p", upstreamCommit, "-m", `P10 A2 探针：伪造上游新提交（改 ${target.name}）`]).trim();
git(["update-ref", PROBE, probeCommit]);
process.stdout.write(`  blob   = ${newBlob.slice(0, 8)}\n  tree   = ${newTree.slice(0, 8)}\n  probe  = ${probeCommit.slice(0, 8)}（父 = ${upstreamCommit.slice(0, 8)}）\n\n`);

process.stdout.write("③ 用 --ref 指向探针跑一次体检（期望 RISK 含该文件 + 退出码 1）\n");
const runScript = (extraArgs) => {
  try {
    const out = execFileSync(process.execPath, [`${ROOT}/${SYNC_SCRIPT}`, ...extraArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { exit: 0, out };
  } catch (error) {
    return { exit: typeof error.status === "number" ? error.status : 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
};
const human = runScript(["--check", "--ref", PROBE]);
process.stdout.write(`${human.out.split("\n").map((line) => `    ${line}`).join("\n")}\n`);
const machine = runScript(["--check", "--json", "--ref", PROBE]);
let payload = null;
try {
  payload = JSON.parse(machine.out.trim().split("\n").pop());
} catch { /* 下面按 payload === null 报失败 */ }

process.stdout.write("④ 断言\n");
check(machine.exit === 1, `探针运行退出码 = 1（实测 ${machine.exit}）`);
check(payload !== null, "--json 输出是合法 JSON");
if (payload) {
  check(Array.isArray(payload.RISK) && payload.RISK.length === 1, `RISK 恰好 1 条（实测 ${payload.RISK?.length}）`);
  check(payload.RISK?.includes(target.name), `RISK 明细里含目标文件 ${target.name}`);
  check(!payload.SAFE?.includes(target.name), "SAFE 里没有该文件（它同时也在 L_dev 里）");
  check(payload.upstreamNewCommits === 1, `上游新提交数 = 1（实测 ${payload.upstreamNewCommits}）`);
  check(payload.exitCode === 1, `JSON 自带 exitCode = 1（实测 ${payload.exitCode}）`);
}

process.stdout.write("\n⑤ 清理：删临时 ref + 复核 refs/heads/master 未被触碰\n");
git(["update-ref", "-d", PROBE]);
const probeGone = gitExit(["rev-parse", "--verify", PROBE]).code !== 0;
const headsAfter = git(["rev-parse", "refs/heads/master"]).trim();
check(probeGone, `临时 ref ${PROBE} 已删除`);
check(headsBefore === headsAfter, `refs/heads/master 未变（${headsBefore.slice(0, 8)}）`);

process.stdout.write(`\n${problems.length === 0 ? "✅ A2 通过" : `❌ A2 失败：${problems.length} 条断言不成立`}\n`);
process.exit(problems.length === 0 ? 0 : 1);
