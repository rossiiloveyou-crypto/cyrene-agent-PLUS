// Orchestrator — unified entry point
// 只负责构建 always-on 上下文（世界书 + L0/L1）；工具的选择和执行由 CyreneHarness 处理
import { updateWorldbookActivation, getPermanentWorldbookEntries, getActiveWorldbookEntries, getCascadeWorldbookEntries, searchMemory, INJECTION_HEADER, INJECTION_PREAMBLE } from "../rag";
import { memoryStore } from "../memory/memory-store";
import { entityGraph } from "../memory/entity-graph";
import { recordRecentMemoryInjection } from "../memory/recent-injected-memory";
import { l2DmaeManager } from "../memory/l2-dmae-manager";
import { buildGroupContextBlock } from "../channels/history-log";
import type { ChannelTraceContext } from "./build-options";
import { toolRegistry } from "./tools/registry/tool-registry";
import { resolveScopeId, rootScope, shouldInjectOwnerProfile, type MemoryScopeId } from "../zones/scope";

/** 群近期上下文取多少条。够覆盖"上一条问句 → 本条引用"的来回，又不至于喧宾夺主。 */
const DEFAULT_GROUP_CONTEXT_LIMIT = 10;

export { ToolCallResult } from "./types";

function isDimensionMismatchError(err: unknown): boolean {
  return err instanceof Error && /dimension mismatch/i.test(err.message);
}
export { scheduleMemoryWrite } from "./context-builder";
export { buildToneInjection } from "./tone-injector";

// topicState TTL 已移除——由 DMAE Activation 状态机接管（见 rag/worldbook.ts）

/**
 * 构建相关记忆注入：返回经 V5 DMAE 排序后的 active L2 记忆，以及导入文档/实体关系。
 * L2 DMAE 状态更新由调用方（call-prompt-builder.ts）在调用本函数前完成。
 *
 * @param scopeId 本轮所属记忆域；缺省视为 root（语音通话与主动聊天都是 owner 域）。
 */
export async function buildMemoryInjection(
  userInput: string,
  scopeId?: MemoryScopeId,
): Promise<string> {
  const scope = scopeId ?? rootScope();
  const parts: string[] = [];

  try {
    // V5 L2：直接读取 DMAE 引擎中 activation >= promptThreshold 的条目，按 activation 降序
    const allL2 = await memoryStore.getL2ForScope(scope);
    const activeL2 = await l2DmaeManager.getActiveL2ForPrompt(allL2, 4, scope);
    recordRecentMemoryInjection(activeL2.map((l2) => l2.id));
    if (activeL2.length > 0) {
      const annotated = activeL2.map((l2) => {
        const sourceQuote = l2.sourceQuote ?? l2.triggerText;
        const hasConflict = !!(l2.conflictWith && l2.conflictWith.length > 0);
        const conflictSuffix = hasConflict ? " ⚠️（该信息可能存在矛盾记录）" : "";
        const quoteSuffix = sourceQuote ? `（原文：${sourceQuote}）` : "";
        return `· ${l2.content}${conflictSuffix}${quoteSuffix}`;
      });
      parts.push("【相关记忆】\n" + annotated.join("\n"));
    }
  } catch (err) {
    if (isDimensionMismatchError(err)) {
      console.error("[Orchestrator] user_memory search blocked: embedding dimension mismatch. Index rebuild required.", err);
      parts.push("【记忆系统】\n⚠️ 向量索引维度不一致，记忆检索已暂停。请在设置中切换 Embedding 模型以重建索引。");
    } else {
      console.warn("[Orchestrator] L2 DMAE injection failed:", err);
    }
  }

  try {
    // 检索 top-2 导入文档片段
    const docResults = await searchMemory(userInput, "imported_doc", 2);
    if (docResults.length > 0) {
      parts.push("【相关文档】\n" + docResults.map((d) => "· " + d).join("\n"));
    }
  } catch (err) {
    if (isDimensionMismatchError(err)) {
      console.error("[Orchestrator] imported_doc search blocked: embedding dimension mismatch. Index rebuild required.", err);
      parts.push("【文档检索】\n⚠️ 向量索引维度不一致，文档检索已暂停。请在设置中切换 Embedding 模型以重建索引。");
    } else {
      console.warn("[Orchestrator] imported_doc search failed:", err);
    }
  }

  try {
    // 实体关系图谱（限域：群聊里抽取的实体不会出现在桌面会话的【人物关系】里）
    const entityInfo = entityGraph.search(userInput, scope);
    if (entityInfo) {
      parts.push("【人物关系】\n" + entityInfo);
    }
  } catch (err) {
    console.warn("[Orchestrator] entity graph search failed:", err);
  }

  return parts.join("\n\n");
}

function getWorldbookTriggerText(userInput: string): string {
  const contextMarkers = [
    "【本轮文件】",
    "【文档内容】",
    "【图片视觉信息】",
    "【图片附件】",
  ];
  const firstContextIndex = contextMarkers
    .map((marker) => userInput.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return (typeof firstContextIndex === "number" ? userInput.slice(0, firstContextIndex) : userInput).trim();
}

/**
 * 构建 always-on 上下文：世界书 + 群聊近期上下文 + L0/L1 画像。
 * 不涉及工具选择和执行——那些由 function calling 处理。
 *
 * @param trace 渠道会话快照（桌面聊天不传）。群聊时追加旁听到的群近期消息，
 *              让"群里 A 提问 → B 只 @ 昔涟说'你知道吗'"这种场景也能看到 A 的问题。
 */
export async function buildAlwaysOnContext(
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
  trace?: ChannelTraceContext,
): Promise<string> {
  const parts: string[] = [];

  // ── 世界书 — 永远跑 ──────────────────────────────────
  // DMAE：常驻始终注入；非常驻条目按 Activation 生命周期门控。
  // updateActivation 在调 LLM 之前跑 → 用户当轮命中的条目当轮就进 Prompt。
  try {
    const permanentWb = getPermanentWorldbookEntries();
    if (permanentWb.length > 0) {
      parts.push("【常驻背景】\n" + permanentWb.join("\n\n"));
    }

    const lastAssistant = recentMessages
      .filter(m => m.role === "assistant")
      .slice(-1)[0]?.content ?? "";
    updateWorldbookActivation(getWorldbookTriggerText(userInput), lastAssistant);  // 打分（本轮用户 + 上轮模型）
    const active = getActiveWorldbookEntries();           // 阈值门控 + 注入
    // One-Shot cascade：用户命中后连带触发的条目（不入 DMAE 状态表，只本轮有效）
    const cascade = getCascadeWorldbookEntries();
    const allInjected = active.length > 0 || cascade.length > 0;
    if (allInjected) {
      const sections: string[] = [];
      if (active.length > 0) {
        sections.push(active.join("\n\n"));
      }
      if (cascade.length > 0) {
        sections.push(cascade.join("\n\n"));
      }
      parts.push(INJECTION_HEADER + "\n" + INJECTION_PREAMBLE + "\n\n" + sections.join("\n\n"));
    }
  } catch (err) {
    console.warn("[Orchestrator] worldbook dmae failed:", err);
  }

  // ── 群聊近期上下文 — 仅群聊渠道 ─────────────────────
  // 读取本群 transcript 的最近若干条（含未 @ 昔涟的旁听消息），
  // 补上"上一条消息在问什么"这类滑窗看不到的话题上下文。
  // 条数来自设置-记忆（经 build-options 的 trace 注入），未提供时用默认值。
  if (trace?.chatType === "group") {
    try {
      const limit = trace.groupContextLimit ?? DEFAULT_GROUP_CONTEXT_LIMIT;
      const groupContext = buildGroupContextBlock(trace.sessionId, limit);
      if (groupContext) parts.push(groupContext);
    } catch (err) {
      console.warn("[Orchestrator] group context build failed:", err);
    }
  }

  // ── L0/L1 画像 — 仅 owner 域 ─────────────────────────
  // 默认值是"注入"，但对未归区的外部会话（尤其群）必须关掉：
  // L0/L1 是用户本人的画像，不能出现在陌生群里。
  const scopeId = resolveScopeId(trace?.sessionId);
  let injectProfile = true;
  try {
    injectProfile = shouldInjectOwnerProfile(scopeId);
  } catch (err) {
    console.warn("[Orchestrator] scope resolve failed:", err);
  }

  if (injectProfile) {
    try {
      const l0 = await memoryStore.getL0();
      const l1 = await memoryStore.getL1();

      const l0Lines = [
        l0.preferredName && `称呼：${l0.preferredName}`,
        l0.occupation && `职业：${l0.occupation}`,
        l0.longTermInterests && `长期兴趣：${l0.longTermInterests}`,
        l0.language && `常用语言：${l0.language}`,
        l0.permanentNote && `备注：${l0.permanentNote}`,
      ].filter(Boolean);

      const l1Lines = [
        l1.recentGoals && `最近目标：${l1.recentGoals}`,
        l1.recentPreferences && `近期偏好：${l1.recentPreferences}`,
        l1.currentProject && `当前项目：${l1.currentProject}`,
      ].filter(Boolean);

      if (l0Lines.length > 0 || l1Lines.length > 0) {
        let memoryContext = "";
        if (l0Lines.length > 0) {
          memoryContext += `[用户画像]\n${l0Lines.join("\n")}\n\n`;
        }
        if (l1Lines.length > 0) {
          memoryContext += `[近期状态]\n${l1Lines.join("\n")}\n\n`;
        }
        parts.push(memoryContext.trim());
      }
    } catch (err) {
      console.warn("[Orchestrator] memory load failed:", err);
    }
  }

  // ── 日志 ──────────────────────────────────────────────
  const enabledTools = toolRegistry.getEnabledTools();
  console.log("[Orchestrator] Always-on context built, enabled tools: " + enabledTools.map(t => t.id).join(", "));

  return parts.join("\n\n");
}
