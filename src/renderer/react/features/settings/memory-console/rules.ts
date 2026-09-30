// 记忆管理台（React 重写）的纯规则函数 —— P9 T2 从 H-07 保留的 3 个「里子」模块**抄写**而来。
//
// 抄写而不是 import 的理由（P9 C4 / N6）：
//   ① `memory/{delete-all,erasure-flow,manager}.ts` 都耦合旧设置窗 DOM（`./dom`、`../shared/modal`）；
//   ② `delete-all.ts` 还依赖 **已被 P4 删除** 的 `../i18n`；
//   ③ `tsconfig.renderer.json` 的 include **不含 `src/renderer/settings/**`**
//      → 直接 import 等于绕过类型门禁（这些文件不在类型检查面内）。
//   ④ 4 个「里子」模块要**原封不动**留在仓库里当参照物（K-07 定案）。
//
// 因此：只把**纯判定逻辑**搬过来，DOM / 弹窗 / i18n 全部在 React 侧重写。
//
// 出处对照（照抄处逐条注明，便于后续核对是否与里子模块漂移）：
//   · isDeleteAllConfirmed          ← src/renderer/settings/memory/delete-all.ts:21-23
//   · canErasePersonKey             ← src/renderer/settings/memory/erasure-flow.ts:68-70
//   · classifyManagerMemory         ← src/renderer/settings/memory/manager.ts:89-97
//   · 三段式擦除的状态机守卫        ← src/renderer/settings/memory/erasure-flow.ts:419-466
//   · 回归轮数上限                  ← src/renderer/settings/memory/erasure-flow.ts:31

/** 详情区里的两组：own = 🗣 他的记忆（彻底擦除会删的那一组）；mentioned = 👥 别人提到他。 */
export type ManagerGroup = "own" | "mentioned";

/** 管理台三视图（与主进程 MemoryManagerView 同口径）。 */
export type ManagerView = "people" | "zones" | "sessions";

/** 三视图的稳定顺序（UI 与测试共用一份，避免两处各写一遍而漂移）。 */
export const MANAGER_VIEWS: readonly ManagerView[] = ["people", "zones", "sessions"];

/** 三段式擦除的稳定视图与常量分界线。 */

/**
 * 群聊近期上下文条数的三个登记值。
 *
 * ⚠️ **镜像值**：权威定义在 `src/main/settings/general-settings.ts:197-199`
 * （`DEFAULT_GROUP_CONTEXT_LIMIT = 10` / `MIN = 3` / `MAX = 50`）。
 * 渲染进程**不能直接 import 主进程模块**，仓内既有做法就是在渲染侧镜像一份
 * （先例：`GeneralSettingsPanel.tsx:17-23` 的 `defaults`；`settings/shared/types.ts:252-253`
 * 对 zones 类型也是同样处理）。
 *
 * `rules.test.ts` 会读主进程源文件逐字比对这三个数 —— 主进程改了而这里没跟，测试立刻红。
 */
export const DEFAULT_GROUP_CONTEXT_LIMIT = 10;
export const MIN_GROUP_CONTEXT_LIMIT = 3;
export const MAX_GROUP_CONTEXT_LIMIT = 50;

/**
 * 「删除全部记忆」的确认短语兜底值。
 *
 * 里子模块 `delete-all.ts:16-18` 走的是 `t("settings.panel.memory.deleteAll.confirmPhrase")`，
 * 而那套 i18n 已被 P4 删除 → 在 React 侧重建为新的 i18n 键
 * `settingsPage.memory.danger.confirmPhrase`，并保留同等兜底语义。
 */
export const DELETE_ALL_CONFIRM_PHRASE_FALLBACK = "删除全部记忆";

/** 「彻底擦除」的确认短语兜底值与里子模块同字（`erasure-flow.ts:27`）。 */
export const ERASE_CONFIRM_PHRASE_FALLBACK = "彻底擦除";

/**
 * 严格相等门控（**trim 不算数**）。
 *
 * 照抄 `delete-all.ts:22` 的口径：不做 trim 是**有意的** ——
 * 否则"顺手粘贴带前后空格"也能通过，二次确认就失去了「我必须亲手打出来」的意义。
 */
export function isDeleteAllConfirmed(input: string, phrase: string): boolean {
  return input === phrase;
}

/** 擦除确认与删除全部记忆**同一口径**（`erasure-flow.ts:63-65`）。 */
export function isEraseConfirmed(input: string, phrase: string): boolean {
  return input === phrase;
}

/**
 * 只有 `"<channel>:<senderId>"` 形态的 personKey 才允许彻底擦除
 * （与主进程 `parsePersonKey` 同一判据，见 `erasure-flow.ts:68-70`）。
 */
export function canErasePersonKey(personKey: string): boolean {
  return personKey.length > 0 && personKey !== "__unattributed__" && personKey.includes(":");
}

/**
 * 详情行的分组判据（照抄 `manager.ts:89-97`）。
 *
 * **只有 subjectIds 命中、speakerIds 不命中**才是「别人提到他」。
 * speakerIds 命中就是他说的（优先）；两个都没命中 → 来自他的私聊会话（私聊即人）→ own。
 *
 * 🔴 这条判据是「删他的话、留关于他的话」的实现基础，**不要"顺手优化"**。
 */
export function classifyManagerMemory(
  memory: { speakerIds?: string[]; subjectIds?: string[] },
  personKey: string | undefined,
): ManagerGroup {
  if (!personKey) return "own";
  const said = (memory.speakerIds ?? []).includes(personKey);
  const mentioned = (memory.subjectIds ?? []).includes(personKey);
  return !said && mentioned ? "mentioned" : "own";
}

/**
 * 把详情里的记忆按 own / mentioned 分组（`manager.ts:257-281` 的纯函数化）。
 * 非 people 视图不分组（返回单组 all），与里子模块的 `groupAll` 分支同口径。
 */
export function groupManagerMemories<T extends { speakerIds?: string[]; subjectIds?: string[] }>(
  memories: readonly T[],
  view: ManagerView,
  personKey: string | undefined,
): { own: T[]; mentioned: T[] } {
  if (view !== "people") return { own: [...memories], mentioned: [] };
  const own: T[] = [];
  const mentioned: T[] = [];
  for (const memory of memories) {
    (classifyManagerMemory(memory, personKey) === "mentioned" ? mentioned : own).push(memory);
  }
  return { own, mentioned };
}

/** 拉取失败 / 未配置 API 时统一说一句人话（而不是把异常抛给用户）。 */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 「预演之后又出现了新记忆」最多允许回到预演的轮数（照抄 `erasure-flow.ts:31`，防写入太频繁时无限循环）。 */
export const MAX_ERASE_RECONFIRM_ROUNDS = 2;

/**
 * 三段式擦除的**放行判据**（纯函数化 `erasure-flow.ts:419-437` 的守卫链）。
 *
 * 任一不满足即**绝不调用 `erasePerson`** —— 里子模块的注释把这条写成硬约束：
 * 预演失败 / 没有 previewId / 取消 / 确认短语不严格相等 → 直接返回。
 */
export function canProceedToErase(input: {
  personKey: string;
  previewId: string | undefined;
  typed: string | null;
  phrase: string;
}): boolean {
  if (!canErasePersonKey(input.personKey)) return false;
  if (input.typed === null || !isEraseConfirmed(input.typed, input.phrase)) return false;
  return Boolean(input.previewId);
}

/** 是否需要（以及是否还能）重新预演（`erasure-flow.ts:441-455`）。 */
export function nextEraseStep(report: { needsReconfirm?: boolean }, round: number): "done" | "reconfirm" | "limit" {
  if (!report.needsReconfirm) return "done";
  return round >= MAX_ERASE_RECONFIRM_ROUNDS ? "limit" : "reconfirm";
}

/**
 * 群聊近期上下文条数：把任意输入归一化到 [min, max] 的整数
 * （与主进程 `normalizeGroupContextLimit` 同一语义，见 `src/main/settings/general-settings.ts:202-206`）。
 *
 * ⚠️ 主进程侧是真正的权威校验；这里只是让 UI 输入框与落盘值一致，避免"显示 3 实际存 10"。
 *
 * ⚠️ 类型门与主进程不同：主进程只面对 JSON 里的 number，**UI 侧还会收到空输入**。
 * 裸 `Number(null)` 会得到 **0**（不是 NaN）→ 会被夹成 min=3，把"用户没填"变成"填了 3"。
 * 所以这里先按"只认 number / 十进制数字字符串"过滤，其余一律回落默认值。
 */
export function normalizeGroupContextLimit(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 输入是否是合法范围内的整数（决定保存按钮可用性）。 */
export function isGroupContextLimitValid(value: unknown, min: number, max: number): boolean {
  const n = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && Number.isInteger(n) && n >= min && n <= max;
}

/** 失败路径清单 → 可读多行文本（照抄 `delete-all.ts:26-29`）。 */
export function describeDeleteAllFailure(failed: ReadonlyArray<{ path: string; error: string }>): string {
  if (failed.length === 0) return "";
  return failed.map((item) => `${item.path}（${item.error}）`).join("\n");
}

/** 区块成员的展示名（`zones/panel.ts` 的成员行同口径）。 */
export function zoneMemberLabel(member: {
  kind: string;
  channel?: string;
  chatId?: string;
  senderName?: string;
  chatType?: string;
  conversationId?: string;
}): string {
  if (member.kind === "desktop") return member.conversationId ?? "";
  const who = member.senderName || member.chatId || "";
  const kind = member.chatType === "group" ? "group" : "private";
  return [member.channel, kind, who].filter(Boolean).join(" · ");
}

/** 成员的唯一性键（同一外部会话同一时刻只属于一个区块，去重与移动都靠它）。 */
export function zoneMemberKey(member: { kind: string; sessionId?: string; conversationId?: string }): string {
  return member.kind === "desktop" ? `desktop:${member.conversationId ?? ""}` : `external:${member.sessionId ?? ""}`;
}
