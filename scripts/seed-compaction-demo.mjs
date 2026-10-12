// 压缩分隔条演示数据种子：往指定（或最近修改的）会话轨迹里追加
// 假消息 + 两个压缩检查点（automatic / manual），用于在聊天页观察
// marker 的位置、文案与 rewind 失效行为，不消耗任何模型 token。
//
// 用法（必须先完全关闭应用，避免与主进程的内存投影缓存/写队列竞争）：
//   node scripts/seed-compaction-demo.mjs            # 往最近修改的会话追加
//   node scripts/seed-compaction-demo.mjs <目录名>   # 指定 transcripts 下的会话目录
//
// 追加内容自上而下：3 轮旧对话 → [自动压缩 marker] → 2 轮中段对话
// → [手动压缩 marker] → 1 轮最新对话。数据全部带 demo 前缀，可按行删除清理。

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const transcriptsRoot = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "Cyrene",
  "transcripts",
);

function pickConversationDir() {
  const arg = process.argv[2];
  if (arg) {
    const resolved = path.join(transcriptsRoot, arg);
    if (!fs.existsSync(path.join(resolved, "transcript.jsonl"))) {
      console.error(`[seed] 找不到 ${resolved} 下的 transcript.jsonl`);
      process.exit(1);
    }
    return resolved;
  }
  const candidates = fs.readdirSync(transcriptsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(transcriptsRoot, entry.name);
      const jsonl = path.join(dir, "transcript.jsonl");
      return { dir, mtime: fs.existsSync(jsonl) ? fs.statSync(jsonl).mtimeMs : 0 };
    })
    .filter((item) => item.mtime > 0)
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    console.error(`[seed] ${transcriptsRoot} 下没有任何会话轨迹，先在应用里建一个会话`);
    process.exit(1);
  }
  return candidates[0].dir;
}

// 读取现有 JSONL，返回 [最大 seq, 追加用的行数组]
function readExisting(jsonlPath) {
  if (!fs.existsSync(jsonlPath)) {
    console.error(`[seed] 缺少 transcript.jsonl：${jsonlPath}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(jsonlPath, "utf8").split("\n").filter((line) => line.trim());
  let maxSeq = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (typeof entry.seq === "number" && entry.seq > maxSeq) maxSeq = entry.seq;
    } catch {
      // 半行（崩溃遗留）按存储层语义忽略，只读完整行
    }
  }
  return maxSeq;
}

const conversationDir = pickConversationDir();
const jsonlPath = path.join(conversationDir, "transcript.jsonl");
let seq = readExisting(jsonlPath);
const now = Date.now();

const rows = [];
const nextSeq = () => ++seq;
function pushUser(turnId, text) {
  rows.push(JSON.stringify({
    seq: nextSeq(), id: `demo-user-${seq}`, at: now, kind: "user",
    turnId, revision: 1, payload: { text },
  }));
}
function pushAssistant(turnId, content) {
  rows.push(JSON.stringify({
    seq: nextSeq(), id: `demo-assistant-${seq}`, at: now, kind: "assistant",
    turnId, payload: { role: "assistant", content },
  }));
}
function pushCheckpoint(trigger, summary) {
  const sourceThroughSeq = seq; // 覆盖到当前最后一条为止
  rows.push(JSON.stringify({
    seq: nextSeq(), id: `demo-compaction-${seq}`, at: now, kind: "compaction_checkpoint",
    payload: {
      baseThroughSeq: 0,
      sourceThroughSeq,
      sourceDigest: `demo-${seq}`,
      // replacement 与真实压缩产物同构：system 角色 + 检查点标记文本
      replacement: { role: "system", content: `<cyrene_compaction_checkpoint>\n${summary}\n</cyrene_compaction_checkpoint>` },
      trigger,
    },
  }));
}

pushUser("demo-1", "旧话题一：帮我安排上周的会议纪要");
pushAssistant("demo-1", "好的，纪要要点如下：……（旧回复一）");
pushUser("demo-2", "旧话题二：上次的旅行计划怎么样了");
pushAssistant("demo-2", "旅行计划更新：……（旧回复二）");
pushUser("demo-3", "旧话题三：那个 bug 后来修好了吗");
pushAssistant("demo-3", "已经修复了，验证通过。（旧回复三）");
pushCheckpoint("automatic", "用户询问了会议纪要、旅行计划与 bug 修复进度，助手逐项给出答复。");

pushUser("demo-4", "中段话题：新的部署方案定了吗");
pushAssistant("demo-4", "定了，走蓝绿部署。（中段回复一）");
pushUser("demo-5", "中段话题：文档什么时候补");
pushAssistant("demo-5", "本周内补齐。（中段回复二）");
pushCheckpoint("manual", "部署方案确定为蓝绿部署；文档承诺本周内补齐。");

pushUser("demo-6", "最新一条：现在还能看到上面的历史吗");
pushAssistant("demo-6", "能看到，被压缩的部分保留为摘要，上方有压缩分隔条标记。（最新回复）");

fs.appendFileSync(jsonlPath, "\n" + rows.join("\n") + "\n", "utf8");
console.log(`[seed] 已追加 ${rows.length} 行到 ${jsonlPath}`);
console.log("[seed] 现在启动应用，打开该会话即可看到两条压缩分隔条（自动 + 手动）。");
console.log("[seed] 提示：右键中段消息选择重新生成（rewind）后，更晚的那条手动压缩标记会随之消失。");
