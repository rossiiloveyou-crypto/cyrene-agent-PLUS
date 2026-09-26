import { enqueueLLMTask } from "../llm-queue"
import { runReflectionAndCompression } from "./memory-compressor"
import { entityGraph } from "./entity-graph"
import type { ExtractedEntity } from "./entity-graph"
import { memoryJudge } from "./memory-judge"
import type { MemoryJudgeOptions } from "./memory-judge"
import { memoryManager } from "./memory-manager"
import { attributeCandidates } from "./person-attribution"
import { runResolverQueueOnce } from "./memory-resolver"
import { memoryStore } from "./memory-store"
import type { MemoryJudgeResult } from "./memory-schemas"
import type { L1Profile, MemoryCandidate, MemoryJudgeTurn, TurnAttribution } from "./memory-types"
import { resolveScopeId, rootScope, type MemoryScopeId } from "../zones/scope"

const MEMORY_JUDGE_INTERVAL = 6
const MEMORY_JUDGE_CONTEXT_TURNS = 8

export interface MemorySchedulerDeps {
  enqueueTask: <T>(label: string, task: () => Promise<T>) => Promise<T>
  judgeMemory: (
    turns: MemoryJudgeTurn[],
    conversationId: string,
    options?: MemoryJudgeOptions,
  ) => Promise<MemoryJudgeResult>
  writeMemory: (candidates: MemoryCandidate[]) => Promise<void>
  /** 把 judge 顺手抽取的命名实体入库（零额外 LLM 调用） */
  ingestEntities: (entities: ExtractedEntity[], scopeId: MemoryScopeId) => void
  getL1: () => Promise<L1Profile>
  replaceL1Field: (field: "roundCount", value: number) => Promise<void>
  runReflectionAndCompression: () => Promise<void>
  runResolverQueueOnce: () => Promise<unknown>
  runDecay: () => Promise<void>
}

export class MemoryScheduler {
  /**
   * 按记忆域分桶的近期轮次。
   *
   * 为什么要分桶：多群并发时，全局单桶会把群 A 的第 3 句和群 B 的第 4 句拼成
   * 同一批 turns 丢给 judge，judge 会把两个群的事当成一段连续对话来抽取记忆——
   * 这是"串记忆"最隐蔽的源头。
   *
   * 每轮额外带 `personKey` / `speakerName` / `messageId`（P2 归属）：
   * judge 要把 `subjectNames` 映射回 personKey，必须知道本批有谁说过话。
   */
  private turnsByScope = new Map<MemoryScopeId, Array<MemoryJudgeTurn & { seq: number }>>()
  private nextTurnSeq = 0

  constructor(private readonly deps: MemorySchedulerDeps) {}

  scheduleMemoryWrite(
    userInput: string,
    assistantReply: string,
    conversationId?: string,
    attribution?: TurnAttribution,
  ): void {
    const scopeId = resolveScopeId(conversationId)
    const seq = ++this.nextTurnSeq
    const bucket = this.turnsByScope.get(scopeId) ?? []
    bucket.push({
      seq,
      userInput,
      assistantReply,
      ...(attribution?.personKey ? { personKey: attribution.personKey } : {}),
      ...(attribution?.speakerName ? { speakerName: attribution.speakerName } : {}),
      ...(attribution?.messageId ? { messageId: attribution.messageId } : {}),
      ...(attribution?.chatType ? { chatType: attribution.chatType } : {}),
    })
    if (bucket.length > MEMORY_JUDGE_CONTEXT_TURNS * 2) {
      bucket.splice(0, bucket.length - MEMORY_JUDGE_CONTEXT_TURNS * 2)
    }
    this.turnsByScope.set(scopeId, bucket)

    this.deps.enqueueTask("MemoryMaintenance", async () => {
      await this.runQueuedMemoryWrite(scopeId, seq, conversationId)
    }).catch((e) => {
      console.error("[PMRS/Scheduler] 记忆写入失败，不影响主流程", e)
    })
  }

  private async runQueuedMemoryWrite(
    scopeId: MemoryScopeId,
    seq: number,
    conversationId?: string,
  ): Promise<void> {
    const l1 = await this.deps.getL1()
    // roundCount 仍全局累加：它只决定"判定频率"，不参与记忆归属。
    // judge 的**输入**（turns）按 scope 隔离，所以抽取结果不会跨域。
    const newCount = (l1.roundCount || 0) + 1

    if (newCount % MEMORY_JUDGE_INTERVAL === 0) {
      try {
        const bucket = this.turnsByScope.get(scopeId) ?? []
        const turns: MemoryJudgeTurn[] = bucket
          .filter((turn) => turn.seq <= seq)
          .slice(-MEMORY_JUDGE_CONTEXT_TURNS)
          .map(({ userInput, assistantReply, personKey, speakerName, messageId, chatType }) => ({
            userInput,
            assistantReply,
            // undefined 字段不下传：桌面路径（无归属）保持与 P1 完全一致的 turn 形状
            ...(personKey ? { personKey } : {}),
            ...(speakerName ? { speakerName } : {}),
            ...(messageId ? { messageId } : {}),
            ...(chatType ? { chatType } : {}),
          }))
        const { candidates, entities } = await this.deps.judgeMemory(turns, conversationId ?? "default", {
          // 非 root 域（群聊 / 独立会话）只允许产出 L2：与 memory-manager 里
          // `!isOwnerScope(scope) → 丢弃 L0/L1` 是同一条判据，只是提前到提示词里说。
          l2Only: scopeId !== rootScope(),
        })

        // 归属注入：LLM 只给「关于谁的人名」与「来自第几轮」，这里映射回 personKey 与消息 id。
        // 同时钉上记忆域：LLM 不产出 scope，归属由调度层负责。
        const scoped: MemoryCandidate[] = attributeCandidates(candidates, turns, scopeId)
          .map((candidate) => ({ ...candidate, scope: scopeId }))
        if (scoped.length > 0) {
          await this.deps.writeMemory(scoped)
        }
        // 实体入库：judge 顺手抽取，零额外 LLM 调用，取代旧的正则 ingest
        if (entities.length > 0) {
          this.deps.ingestEntities(entities, scopeId)
        }
      } catch (err) {
        console.error("[PMRS/Scheduler] Judge/Manager 执行失败，本轮仍会计数", err)
      }
    }

    await this.deps.replaceL1Field("roundCount", newCount)

    if (newCount % 5 === 0) {
      try {
        await this.deps.runResolverQueueOnce()
      } catch (err) {
        console.warn("[PMRS/Scheduler] Resolver 队列处理失败，不影响主流程", err)
      }
    }

    if (newCount % 20 === 0) {
      console.log("[PMRS/Scheduler] 达到 20 轮，触发回顾 + 片段压缩")
      await this.deps.runReflectionAndCompression()
    }

    if (newCount % 50 === 0) {
      try {
        await this.deps.runDecay()
      } catch (err) {
        console.warn("[PMRS/Scheduler] L2 权重衰减失败，不影响主流程", err)
      }
    }
  }
}

export const memoryScheduler = new MemoryScheduler({
  enqueueTask: enqueueLLMTask,
  judgeMemory: (turns, conversationId, options) => memoryJudge.judgeRecentTurns(turns, conversationId, options),
  writeMemory: (candidates) => memoryManager.writeMemory(candidates),
  ingestEntities: (entities, scopeId) => entityGraph.ingestEntities(entities, scopeId),
  getL1: () => memoryStore.getL1(),
  replaceL1Field: (field, value) => memoryStore.replaceL1Field(field, value),
  runReflectionAndCompression,
  runResolverQueueOnce,
  runDecay: () => memoryManager.runDecay(),
})
