import type { L2MemoryStatus } from "./memory-types";

export interface CompressionSource {
  id: string;
  ragId?: string;
  status: L2MemoryStatus;
}

export interface CompressionTransactionInput {
  content: string;
  triggerText: string;
  sourceConversationId: string;
  sources: CompressionSource[];
  /** 记忆域：总结继承被压缩条目的域，缺失表示 legacy（无域）。 */
  scope?: string;
  /**
   * P2 归属：总结继承被压缩条目的**并集**（说话人 / 关于谁）。
   *
   * 为什么是并集而不是"混合的就不写"：并集保留完整信息，
   * 「总结里含被删者怎么办」是 P3 删除策略的事（总概览 §4.4），P2 只保证信息不丢。
   */
  speakerIds?: string[];
  subjectIds?: string[];
}

export interface CompressionTransactionDeps {
  createSummary(input: {
    content: string;
    triggerText: string;
    sourceConversationId: string;
    isPinned: false;
    isSummary: true;
    subEntryIds: string[];
    syncStatus: "pending_sync";
    scope?: string;
    speakerIds?: string[];
    subjectIds?: string[];
  }): Promise<{ id: string }>;
  addSummaryVector(text: string, l2Id: string, metadata: Record<string, unknown>, scopeId?: string): Promise<string>;
  markSummarySynced(l2Id: string, ragId: string): Promise<unknown>;
  archiveSources(ids: string[]): Promise<void>;
  restoreSources(sources: CompressionSource[]): Promise<void>;
  deactivateSummary(id: string): Promise<void>;
  deleteSummary(id: string): Promise<void>;
  deleteVectors(ids: string[]): Promise<unknown> | unknown;
  warn(message: string, error: unknown): void;
}

export async function commitMemoryCompression(
  input: CompressionTransactionInput,
  deps: CompressionTransactionDeps,
): Promise<{ summaryId: string; ragId: string }> {
  const subEntryIds = input.sources.map((source) => source.id);
  const summary = await deps.createSummary({
    content: input.content,
    triggerText: input.triggerText,
    sourceConversationId: input.sourceConversationId,
    isPinned: false,
    isSummary: true,
    subEntryIds,
    syncStatus: "pending_sync",
    ...(input.scope ? { scope: input.scope } : {}),
    // P2 归属：空数组不落字段（与 memory-manager.writeL2 同一约定）
    ...(input.speakerIds?.length ? { speakerIds: input.speakerIds } : {}),
    ...(input.subjectIds?.length ? { subjectIds: input.subjectIds } : {}),
  });

  let summaryRagId: string | undefined;
  let archiveStarted = false;
  try {
    summaryRagId = await deps.addSummaryVector(input.content, summary.id, {
      isSummary: true,
      subEntryIds,
      source: "memory_compressor",
    }, input.scope);
    await deps.markSummarySynced(summary.id, summaryRagId);
    archiveStarted = true;
    await deps.archiveSources(subEntryIds);
  } catch (error) {
    try {
      await deps.deactivateSummary(summary.id);
    } catch (rollbackError) {
      deps.warn("Failed to deactivate rolled-back memory summary", rollbackError);
    }
    if (archiveStarted) {
      try {
        await deps.restoreSources(input.sources);
      } catch (rollbackError) {
        deps.warn("Failed to restore source memories after compression rollback", rollbackError);
      }
    }
    if (summaryRagId) {
      try {
        await deps.deleteVectors([summaryRagId]);
      } catch (rollbackError) {
        deps.warn("Failed to delete rolled-back memory summary vector", rollbackError);
      }
    }
    try {
      await deps.deleteSummary(summary.id);
    } catch (rollbackError) {
      deps.warn("Failed to delete rolled-back memory summary", rollbackError);
    }
    throw error;
  }

  const archivedRagIds = input.sources
    .map((source) => source.ragId)
    .filter((ragId): ragId is string => typeof ragId === "string" && ragId.length > 0);
  try {
    await deps.deleteVectors(archivedRagIds);
  } catch (error) {
    deps.warn("Failed to clean archived memory vectors", error);
  }

  return { summaryId: summary.id, ragId: summaryRagId };
}
