#!/usr/bin/env node
// P10 T1 · 上游同步体检（开发脚本 —— 零依赖，只用 node: 内置模块，不进产品运行路径）
//
// 回答三个问题（这是本脚本存在的全部理由）：
//   ① 上游动了吗？            → `上游新提交 = N`
//   ② 会不会撞上我们的改动？  → RISK = U_new ∩ L_dev
//   ③ 现在能不能干净地跟？    → SAFE = U_new \ L_dev
//
// 🔴 核心判据（不要退化成"看上游提交数"）：**"安全"与否只看 `RISK` 是否为空**。
//    上游改动再多，只要没有一条落在我们改过的路径上，就是干净的（SAFE 全量可吃进来）。
//    反之上游只改 1 个文件，而那 1 个正是我们改过的 → 必须人工定处置。见判据台账 J-36。
//
// 用法（`node scripts/merge/upstream-sync.mjs --help` 输出同一份）：
//   node scripts/merge/upstream-sync.mjs [--check] [--fetch] [--json] [--ref <ref>]
//
// 退出码：0 = RISK 为空（可以干净地跟）｜1 = RISK 非空（先读报告再决定）｜
//         2 = 上游通道不可达（离线口径，不伪造结果）｜3 = 前置/内部错误（状态文件损坏、ref 解析不了）
//
// 副作用（唯一被允许的一次写操作）：`--fetch` 时写 `refs/remotes/official/master`。
// 本脚本**不碰**工作区、索引、`refs/heads/**`（P10 蓝图 §零 C1/Y7）。

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REF = "refs/remotes/official/master";
const STATE_FILE = ".cyrene-sync-state.json";
const REPORT_DIR = join(".cyrene-merge-analysis", "sync");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const HELP = `用法: node scripts/merge/upstream-sync.mjs [选项]

选项:
  --check            默认动作。读同步点 → 算 U_new / L_dev / RISK / SAFE → 写报告 → 按 RISK 定退出码
  --fetch            体检前先抓取上游（先镜像路径、失败再 github）。抓取失败 → 退出码 2，且不写任何 ref
  --json             只输出一行 JSON 到 stdout（不写报告、不打印人读文本），供其它工具接入
  --ref <ref>        指定要比对的"上游" ref（默认 ${DEFAULT_REF}）。
                     伪造探针用它指向临时 ref（见 P10 蓝图 §四 4.1.2 判据 A2）
  --help, -h         打印本帮助

退出码:
  0  RISK 为空 —— 上游没有碰到我们改过的路径，可以干净地跟
  1  RISK 非空 —— 有 N 条路径双方都动过，合并前必须先读报告逐条定处置
  2  上游通道不可达（镜像目录不在 + 无网）—— 走离线口径，不要伪造 fetch 结果
  3  前置/内部错误（状态文件缺失或损坏、ref 解析不了）

只读保证: 除 --fetch 写 ${DEFAULT_REF} 外，不修改工作区、索引与 refs/heads/**。`;

function fail3(message) {
  process.stderr.write(`upstream-sync: ${message}\n`);
  process.exit(3);
}

function parseArgs(argv) {
  const options = { fetch: false, json: false, ref: "", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--check") options.check = true;
    else if (arg === "--fetch") options.fetch = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--ref") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail3("--ref 需要一个参数");
      options.ref = value;
      index += 1;
    } else fail3(`未知参数 ${arg}（用 --help 看用法）`);
  }
  return options;
}

/** 跑一条 git 命令，返回 { cmd, out, code, err }（**永不抛**，好让报告能把失败原文写下来）。 */
function git(args) {
  const cmd = `git ${args.join(" ")}`;
  try {
    const out = execFileSync("git", ["-C", REPO_ROOT, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { cmd, out, code: 0, err: "" };
  } catch (error) {
    return {
      cmd,
      out: typeof error.stdout === "string" ? error.stdout : "",
      code: typeof error.status === "number" ? error.status : 1,
      err: typeof error.stderr === "string" ? error.stderr : String(error.message ?? error),
    };
  }
}

/** `git diff --name-only <a> <b>` → 去空行的路径数组（口径：默认 `core.autocrlf`，与全任务一致）。 */
function nameOnly(from, to) {
  const result = git(["diff", "--name-only", from, to]);
  if (result.code !== 0) fail3(`${result.cmd} 失败：${result.err.trim()}`);
  return result.out.split("\n").map((line) => line.trim()).filter(Boolean);
}

function readState() {
  const path = join(REPO_ROOT, STATE_FILE);
  if (!existsSync(path)) fail3(`状态文件不存在：${STATE_FILE}（同步点无从得知）`);
  let state;
  try {
    state = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail3(`${STATE_FILE} 不是合法 JSON：${error.message}`);
  }
  if (!state?.lastSyncedCommit) fail3(`${STATE_FILE} 缺 lastSyncedCommit`);
  return state;
}

/** `--fetch`：先镜像、后 github。全部失败 → 返回失败清单（调用方 exit 2）。 */
function fetchUpstream(state, ref) {
  const sources = [state?.upstream?.mirrorPath, state?.upstream?.github].filter(Boolean);
  if (sources.length === 0) fail3(`${STATE_FILE} 的 upstream 里没有 mirrorPath / github`);
  const attempts = [];
  for (const source of sources) {
    const result = git(["fetch", "--no-tags", source, `master:${ref}`]);
    attempts.push({ source, ...result });
    if (result.code === 0) return { ok: true, attempts };
    if (attempts.length === 1) process.stderr.write(`upstream-sync: 镜像路径抓取失败，改试 github…\n`);
  }
  return { ok: false, attempts };
}

function formatList(title, list) {
  if (list.length === 0) return `${title} (0)\n  （空）\n`;
  return `${title} (${list.length})\n${list.map((item) => `  ${item}`).join("\n")}\n`;
}

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
    iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  };
}

function writeReport(report) {
  const dir = join(REPO_ROOT, REPORT_DIR);
  mkdirSync(dir, { recursive: true });
  // 文件名带时分秒：同日跑多次（例行体检 + A2 伪造探针）不会互相覆盖，证据留得住。
  // 同一秒内跑两次（脚本化连跑）会撞名 → 再加 -2 / -3 后缀兜底，保证"每次体检一份报告"。
  const base = `${report.stamp.date}-${report.stamp.time}`;
  let file = join(dir, `${base}-报.md`);
  for (let attempt = 2; existsSync(file); attempt += 1) {
    file = join(dir, `${base}-${attempt}-报.md`);
  }
  writeFileSync(file, report.markdown, "utf8");
  return file;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const state = readState();
  const ref = options.ref || state?.upstream?.ref || DEFAULT_REF;
  const lastSynced = String(state.lastSyncedCommit).trim();

  let fetchNote = "未执行（无 --fetch）";
  if (options.fetch) {
    const result = fetchUpstream(state, DEFAULT_REF);
    if (!result.ok) {
      const detail = result.attempts
        .map((attempt) => `  ${attempt.source}\n    exit=${attempt.code}\n    ${attempt.err.trim().split("\n").join("\n    ")}`)
        .join("\n");
      process.stderr.write(`upstream-sync: 🔴 上游通道不可达（镜像 + github 都失败）—— 走离线口径，不伪造结果\n${detail}\n`);
      return 2;
    }
    fetchNote = `已抓取：${result.attempts[result.attempts.length - 1].source}`;
  }

  const refCommit = git(["rev-parse", "--verify", `${ref}^{commit}`]);
  if (refCommit.code !== 0) fail3(`解析不了 ${ref}（先跑一次 --fetch，或用 --ref 指定）`);
  const lastCommit = git(["rev-parse", "--verify", `${lastSynced}^{commit}`]);
  if (lastCommit.code !== 0) fail3(`同步点 ${lastSynced} 在本地对象库里不存在`);
  const headCommit = git(["rev-parse", "--verify", "HEAD^{commit}"]);
  if (headCommit.code !== 0) fail3("解析不了 HEAD");

  const countResult = git(["rev-list", "--count", `${lastCommit.out.trim()}..${refCommit.out.trim()}`]);
  const ahead = countResult.code === 0 ? Number(countResult.out.trim()) : -1;

  const uNew = nameOnly(lastCommit.out.trim(), refCommit.out.trim());
  const lDev = nameOnly(refCommit.out.trim(), "HEAD");
  const lDevSet = new Set(lDev);
  const risk = uNew.filter((path) => lDevSet.has(path));
  const safe = uNew.filter((path) => !lDevSet.has(path));

  const stampValue = stamp();
  const verdict = risk.length === 0
    ? "✅ 干净可跟 —— 上游没有碰到我们改动过的任何路径"
    : `🔴 会撞车 —— ${risk.length} 条路径双方都动过，合并前先逐条定处置`;

  const payload = {
    upstreamRef: ref,
    upstreamHead: refCommit.out.trim(),
    lastSyncedCommit: lastCommit.out.trim(),
    head: headCommit.out.trim(),
    upstreamNewCommits: ahead,
    U_new: uNew,
    L_dev: lDev,
    RISK: risk,
    SAFE: safe,
    checkedAt: stampValue.iso,
    exitCode: risk.length === 0 ? 0 : 1,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return payload.exitCode;
  }

  const markdown = `# 上游同步体检报告 · ${stampValue.date} ${stampValue.time}

> 由 \`scripts/merge/upstream-sync.mjs\` 生成（P10 T1）。**本报告是"下次合并前先读这份"的入口页。**
> 判据 **J-36**：安全与否只看 \`RISK = U_new ∩ L_dev\` 是否为空，**不看上游提交数**。

| 项 | 值 |
|---|---|
| 体检时间 | ${stampValue.iso} |
| 上游 ref | \`${ref}\` |
| 上游 HEAD | \`${payload.upstreamHead}\` |
| 同步点（lastSyncedCommit） | \`${payload.lastSyncedCommit}\` |
| 本地 HEAD | \`${payload.head}\` |
| **上游新提交数** | **${ahead}** |
| **U_new（上游新动的文件）** | **${uNew.length}** |
| **L_dev（我们相对上游的差异）** | **${lDev.length}** |
| **RISK（双方都动过）** | **${risk.length}** |
| **SAFE（能干净吃进来）** | **${safe.length}** |
| 抓取 | ${fetchNote} |
| **判定** | ${verdict} |

## 一、四条命令的原文与输出

四条命令就是本报告的全部口径，任何人都可以逐字复跑。

\`\`\`
$ git rev-list --count ${lastCommit.out.trim()}..${refCommit.out.trim()}
${ahead}
\`\`\`

\`\`\`
$ git diff --name-only ${lastCommit.out.trim()} ${refCommit.out.trim()}          # U_new
${uNew.join("\n") || "（空）"}
\`\`\`

\`\`\`
$ git diff --name-only ${refCommit.out.trim()} HEAD          # L_dev
${lDev.join("\n") || "（空）"}
\`\`\`

\`\`\`
$ RISK = U_new ∩ L_dev
${risk.join("\n") || "（空）"}
\`\`\`

${formatList("## 二、U_new · 上游新动的文件", uNew)}
${formatList("## 三、RISK · 🔴 会撞车的文件（逐条定处置）", risk)}
${formatList("## 四、SAFE · 能干净吃进来的文件", safe)}

## 五、处置指引（照 \`SYNC-上游同步SOP.md\` 走）

- **RISK 为空** → 先打锚点 \`git tag pre-sync-${stampValue.date}\`，再 \`git merge ${ref}\`。
- **RISK 非空** → 按**文件**逐个定处置；先查 \`ABANDONED-有意放弃清单.md\`"这个文件我们当初放弃过什么"，
  并遵守已拍板决策 **D1–D7**。**不要**直接 merge。
- 同步完成后：更新 \`${STATE_FILE}\` 的 \`lastSyncedCommit\` / \`lastSyncedAt\` / \`mergeCommit\`
  （**SOP 的第一条 checklist** —— 这一步最容易忘）。
`;

  let reportPath = "";
  try {
    reportPath = writeReport({ stamp: stampValue, markdown });
  } catch (error) {
    process.stderr.write(`upstream-sync: 报告写入失败（不影响判定）：${error.message}\n`);
  }

  process.stdout.write(`上游同步体检 · ${stampValue.iso}\n`);
  process.stdout.write(`  上游 ref          : ${ref} → ${payload.upstreamHead.slice(0, 8)}\n`);
  process.stdout.write(`  同步点            : ${payload.lastSyncedCommit.slice(0, 8)}\n`);
  process.stdout.write(`  上游新提交        : ${ahead}\n`);
  process.stdout.write(`  U_new / L_dev     : ${uNew.length} / ${lDev.length}\n`);
  process.stdout.write(`  RISK              : ${risk.length}${risk.length ? ` → ${risk.slice(0, 10).join(", ")}${risk.length > 10 ? " …" : ""}` : ""}\n`);
  process.stdout.write(`  SAFE              : ${safe.length}\n`);
  process.stdout.write(`  抓取              : ${fetchNote}\n`);
  process.stdout.write(`  判定              : ${verdict}\n`);
  if (reportPath) process.stdout.write(`  报告              : ${reportPath}\n`);
  if (risk.length > 0) process.stdout.write("  🔴 下次合并前先读这份报告\n");
  return payload.exitCode;
}

process.exit(main());
