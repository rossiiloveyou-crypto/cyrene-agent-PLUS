import { useEffect, useMemo, useState } from "react";
import type { ChatMessageItem } from "./ChatMessageList";
import { ChatMessageList } from "./ChatMessageList";
import { useTranslation } from "../../../i18n";
import { chatStore } from "../pages/chat-page-bridge";
import { getCharacterStatusMoodSet, getCharacterStatusMoodUrl, type CharacterStatusMood } from "../../../character-status-moods";
import type { TaskSession, TaskTraceRecord } from "../../../../../shared/task-session";
import type { AgentRoundRecord, ProcessMessageRecord, ReasoningBlock, ToolExecutionRecord } from "../../../../../shared/chat-types";
import type { TaskPlanPresentation } from "./run-presentation";
import { resolveAsset } from "../../../../../shared/renderer-base";
import { useCyreneAvatar } from "../../../hooks/useCyreneAvatar";
import "./TaskSessionInspector.css";

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return value == null ? "" : JSON.stringify(value) ?? String(value);
  return value.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const item = part as { type?: unknown; text?: unknown };
    return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
  }).join("");
}

function tracePresentation(session: TaskSession): {
  agentRounds: AgentRoundRecord[];
  reasoningBlocks: ReasoningBlock[];
  processMessages: ProcessMessageRecord[];
  tools: ToolExecutionRecord[];
  candidateText: string;
} {
  const rounds = new Map<string, AgentRoundRecord>();
  const reasoning = new Map<string, ReasoningBlock>();
  const processMessages: ProcessMessageRecord[] = [];
  const candidateParts = new Map<string, string>();
  const discardedCandidates = new Set<string>();
  const toolEnds = new Map<string, { record: TaskTraceRecord; seq: number }>();
  const toolStarts: Array<{ id: string; name: string; displayName?: string; seq: number; roundId?: string }> = [];

  session.trace.forEach((record, seq) => {
    if (record.kind === "round" && record.label) {
      if (record.phase === "start") rounds.set(record.label, { id: record.label, status: "running", startedAt: record.at });
      if (record.phase === "end") {
        const round = rounds.get(record.label);
        if (round) rounds.set(record.label, { ...round, status: "completed", completedAt: record.at });
      }
    } else if (record.kind === "candidate" && record.label) {
      if (record.phase === "discard") discardedCandidates.add(record.label);
      else if (record.phase === "delta") candidateParts.set(record.label, (candidateParts.get(record.label) ?? "") + (record.content ?? ""));
    } else if (record.kind === "reasoning" && record.label) {
      const current = reasoning.get(record.label) ?? { id: record.label, content: "", seq, roundId: record.roundId };
      if (record.phase === "delta") current.content += record.content ?? "";
      if (record.phase === "end") current.streaming = false;
      else if (record.phase === "start" || record.phase === "delta") current.streaming = true;
      reasoning.set(record.label, current);
    } else if (record.kind === "progress" && record.content) {
      processMessages.push({ id: record.id, content: record.content, seq, roundId: record.roundId });
    } else if (record.kind === "tool" && record.phase === "start" && record.label) {
      toolStarts.push({ id: record.id, name: record.label, displayName: record.displayName, seq, roundId: record.roundId });
    } else if (record.kind === "tool" && record.phase === "end" && record.label) {
      toolEnds.set(record.label, { record, seq });
    }
  });

  const toolResults = new Map<string, string>();
  const toolCalls: Array<{ id: string; name: string; arguments: string; seq: number; roundId?: string; displayName?: string }> = [];
  const usedStarts = new Set<number>();
  session.messages.forEach((message, messageIndex) => {
    if (message.role === "tool" && typeof message.toolCallId === "string") {
      toolResults.set(message.toolCallId, textContent(message.content));
    }
    if (message.role !== "assistant" || !Array.isArray(message.toolCalls)) return;
    for (const rawCall of message.toolCalls) {
      if (!rawCall || typeof rawCall !== "object") continue;
      const call = rawCall as { id?: unknown; name?: unknown; arguments?: unknown };
      if (typeof call.id !== "string" || typeof call.name !== "string") continue;
      const args = typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments ?? {}) ?? "{}";
      const ended = toolEnds.get(call.id);
      const startedIndex = toolStarts.findIndex((item, index) => item.name === call.name && !usedStarts.has(index));
      const started = startedIndex >= 0 ? toolStarts[startedIndex] : undefined;
      if (startedIndex >= 0) usedStarts.add(startedIndex);
      toolCalls.push({
        id: call.id,
        name: call.name,
        arguments: args,
        seq: started?.seq ?? ended?.seq ?? messageIndex * 10,
        ...(started?.displayName ? { displayName: started.displayName } : {}),
        ...(ended?.record.roundId ?? started?.roundId
          ? { roundId: ended?.record.roundId ?? started?.roundId }
          : {}),
      });
    }
  });
  const tools: ToolExecutionRecord[] = toolCalls.map((call) => {
    const ended = toolEnds.get(call.id);
    const result = toolResults.get(call.id);
    const status = ended
      ? (ended.record.status === "success" ? "success" : "error")
      : session.status === "running" ? "running" : "error";
    return {
      id: call.id,
      name: call.name,
      ...(call.displayName ? { displayName: call.displayName } : {}),
      status,
      argsText: call.arguments,
      ...(result !== undefined ? { result } : {}),
      seq: call.seq,
      ...(call.roundId ? { roundId: call.roundId } : {}),
    };
  });
  if (session.status === "running") {
    toolStarts.forEach((start, index) => {
      if (usedStarts.has(index)) return;
      tools.push({
        id: `trace-${start.id}`,
        name: start.name,
        ...(start.displayName ? { displayName: start.displayName } : {}),
        status: "running",
        seq: start.seq,
        ...(start.roundId ? { roundId: start.roundId } : {}),
      });
    });
  }

  return {
    agentRounds: [...rounds.values()],
    reasoningBlocks: [...reasoning.values()],
    processMessages,
    tools,
    candidateText: [...candidateParts.entries()].reverse().find(([roundId]) => !discardedCandidates.has(roundId))?.[1] ?? "",
  };
}

function toChatMessages(session: TaskSession): ChatMessageItem[] {
  const visible = session.messages.flatMap((message, index): ChatMessageItem[] => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const content = textContent(message.content);
    if (message.role === "assistant" && !content.trim()) return [];
    return [{
      id: `${session.id}-${index}`,
      role: message.role === "assistant" ? "assistant" : "user",
      content,
    }];
  });
  const activity = tracePresentation(session);
  const finalAnswer = session.resultText ?? session.error?.message ?? "";
  const finalAlreadyPresent = Boolean(finalAnswer && visible.at(-1)?.content === finalAnswer);
  const candidateText = session.status === "running" ? activity.candidateText : "";
  const assistant: ChatMessageItem = {
    id: `${session.id}-activity`,
    role: "assistant",
    content: finalAlreadyPresent ? "" : finalAnswer,
    ...(candidateText ? { transientText: candidateText, streaming: true } : {}),
    runActivity: {
      startedAt: session.createdAt,
      ...(session.status === "running" ? {} : { completedAt: session.completedAt ?? session.updatedAt }),
      reasoningMs: 0,
      ...(session.status === "interrupted" ? { keepExpanded: true } : {}),
    },
    ...activity,
    taskPlan: {
      title: session.description,
      steps: session.todoItems
        .filter((item) => item.status !== "cancelled")
        .map((item) => ({
          id: item.id,
          title: item.content,
          status: item.status === "in_progress" ? "running" : item.status === "completed" ? "completed" : "pending",
        })),
    } satisfies TaskPlanPresentation,
    loading: session.status === "running",
  };
  visible.push(assistant);
  return visible;
}

function taskMood(session: TaskSession | null): CharacterStatusMood {
  if (!session) return "连接中";
  if (session.status === "completed") return "已处理";
  if (session.status === "failed" || session.status === "cancelled" || session.status === "interrupted") return "已中断";

  const currentActivity = [...session.trace].reverse().find((record) =>
    record.kind === "progress"
    || (record.kind === "tool" && record.phase === "start")
    || (record.kind === "reasoning" && (record.phase === "start" || record.phase === "delta"))
    || (record.kind === "round" && record.phase === "start"),
  );
  return currentActivity?.kind === "tool" || currentActivity?.kind === "progress" ? "工作中" : "思考中";
}

export function TaskSessionInspector({
  taskId,
  parentConversationId,
  description,
  nickname,
  assetFileName,
  preferredAddress,
  active,
}: {
  taskId: string;
  parentConversationId: string;
  description: string;
  nickname: string;
  assetFileName: string;
  preferredAddress: string;
  active: boolean;
}) {
  const { t } = useTranslation();
  const cyreneAvatarUrl = useCyreneAvatar();
  const [session, setSession] = useState<TaskSession | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const messages = useMemo(() => session ? toChatMessages(session) : [], [session]);

  useEffect(() => {
    if (!active) {
      setSession(null);
      return;
    }
    let mounted = true;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const result = await chatStore()?.getTaskSession(taskId, parentConversationId);
        if (!mounted) return;
        setSession((current) => current?.updatedAt === result?.updatedAt ? current : result ?? null);
        setLoadFailed(false);
        if (result?.status === "running") timer = window.setTimeout(() => void refresh(), 600);
      } catch {
        if (!mounted) return;
        setLoadFailed(true);
        timer = window.setTimeout(() => void refresh(), 1500);
      }
    };
    void refresh();
    return () => {
      mounted = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, parentConversationId, taskId]);

  const status = session?.status ?? "running";
  const statusLabel = status === "running"
    ? t("taskDelegation.statusRunning")
    : status === "completed"
      ? t("taskDelegation.statusCompleted")
      : status === "cancelled"
        ? t("taskDelegation.statusCancelled")
        : status === "failed"
          ? t("taskDelegation.statusFailed")
          : t("taskDelegation.statusInterrupted");
  const mood = taskMood(session);
  const moodUrl = getCharacterStatusMoodUrl(assetFileName, mood);
  const moodAssets = useMemo(() => getCharacterStatusMoodSet(assetFileName), [assetFileName]);
  const assistantAvatar = useMemo(
    () => moodUrl ? { src: moodUrl, alt: nickname, sprite: true } : undefined,
    [moodUrl, nickname],
  );

  return (
    <section className="cy-task-session-inspector">
      <header className="cy-task-session-inspector__header">
        <div className="cy-task-session-inspector__title">{description}</div>
        <div className="cy-task-session-inspector__header-status">
          <div className={`cy-task-session-inspector__status is-${status}`}>{statusLabel}</div>
          {session?.companionId && (
            <div className={`cy-task-session-inspector__context${session.contextOpen === false ? " is-closed" : " is-open"}`}>
              {t(session.contextOpen === false ? "taskDelegation.contextClosed" : "taskDelegation.contextOpen")}
            </div>
          )}
        </div>
      </header>
      {loadFailed && <div className="cy-task-session-inspector__message">{t("taskDelegation.loadFailed")}</div>}
      {!session && !loadFailed && (
        <div className="cy-task-session-inspector__message cy-task-session-inspector__message--with-avatar">
          {moodUrl && <img className="cy-task-session-inspector__loading-avatar" src={moodUrl} alt={nickname} draggable={false} />}
          <span>{t("taskDelegation.loading")}</span>
        </div>
      )}
      {session && (
        <ChatMessageList
          messages={messages}
          conversationId={parentConversationId}
          mode={session.mode}
          preferredAddress={preferredAddress}
          characterMoodAssets={moodAssets}
          assistantAvatar={assistantAvatar}
          userAvatar={{ src: cyreneAvatarUrl, alt: t("messageList.cyreneAvatarAlt") }}
          revisionBusy
          workspaceRoot={session.resolvedWorkspaceRoot}
        />
      )}
    </section>
  );
}
