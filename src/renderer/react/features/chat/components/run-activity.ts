import { t } from "../../../i18n";
import type { RunActivityRecord } from "../../../../../shared/chat-types";

export interface RunActivitySnapshot {
  processingMs: number;
  reasoningMs: number;
  processing: boolean;
}

export function resolveRunActivitySnapshot(
  activity: RunActivityRecord,
  now: number,
): RunActivitySnapshot {
  const completedAt = activity.completedAt;
  const effectiveNow = completedAt ?? now;
  return {
    processingMs: Math.max(0, effectiveNow - activity.startedAt),
    reasoningMs: Math.max(
      0,
      activity.reasoningMs + (activity.activeReasoningStartedAt
        ? effectiveNow - activity.activeReasoningStartedAt
        : 0),
    ),
    processing: completedAt === undefined,
  };
}

export function resolveRunActivityExpanded(
  expandedById: Readonly<Record<string, boolean>>,
  activityId: string,
  activity: RunActivityRecord,
): boolean {
  // 运行中默认展开过程，让用户看得到 agent 正在做什么；结算后默认折叠，只在对话里留下最终回复。
  // 取消/超时/失败以及没产出正式回答的运行用 keepExpanded 保持展开，避免藏掉唯一的执行证据。
  // 用户手动点过的以用户选择为准。
  return expandedById[activityId] ?? (activity.keepExpanded === true || activity.completedAt === undefined);
}

export function shouldAutoCollapseRunActivity(
  wasProcessing: boolean,
  isProcessing: boolean,
  keepExpanded = false,
): boolean {
  return wasProcessing && !isProcessing && !keepExpanded;
}

export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  return minutes > 0
    ? t("runActivity.elapsedMinutes", { minutes, seconds: remainderSeconds })
    : t("runActivity.elapsedSeconds", { seconds: remainderSeconds });
}
