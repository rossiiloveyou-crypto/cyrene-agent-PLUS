// P9 T2 · 记忆管理台（React 重写）。
//
// 对应旧面板 `src/renderer/settings/memory/manager.ts`（H-07 保留的「里子」模块，只读参照）。
// 保留的能力与**硬约束**（照抄里子模块注释里写死的三条，别在重写时丢掉）：
//   1) 「彻底擦除」**只在详情区**出现，列表行永远拿不到它（最危险的动作不放列表里，防误点）；
//   2) 详情区把「🗣 他的记忆」与「👥 别人提到他」**分开显示、分开勾选**；
//      删 mentioned 组前必须先弹一句「会连带动到别人的记录」的警告；
//   3) 三段式擦除：预演 → 强确认 → 执行；任一守卫不满足**绝不调用 erasePerson**。
//
// 数据形状全部来自 `src/renderer/settings/shared/types.ts`（**纯类型文件**，见 P9 §二 F2/C4 说明）。

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Spin } from "antd";
import { Eraser, RefreshCw, Search, Trash2, Users } from "lucide-react";
import type {
  MemoryManagerItem,
  MemoryManagerMemory,
  MemoryManagerQueryMeta,
  PersonErasePlan,
  PersonEraseReport,
} from "../../../../settings/shared/types";
import { useTranslation } from "../../../i18n";
import { Card } from "../../../components/ui/Card";
import {
  canProceedToErase,
  canErasePersonKey,
  errorText,
  groupManagerMemories,
  MANAGER_VIEWS,
  MAX_ERASE_RECONFIRM_ROUNDS,
  nextEraseStep,
  type ManagerView,
} from "./rules";

interface DetailState {
  item: MemoryManagerItem;
  memories: MemoryManagerMemory[];
  meta: MemoryManagerQueryMeta;
}

type Feedback = { type: "success" | "error" | "info"; text: string } | null;

/** 里子模块 `ERASE_PLAN_SAMPLE_LIMIT / ERASE_PLAN_PRESERVED_LIMIT / ERASE_PLAN_RESIDUE_LIMIT` 同值。 */
const SAMPLE_LIMIT = 3;
const PRESERVED_LIMIT = 8;
const RESIDUE_LIMIT = 10;

function bytesText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

export function MemoryManagerSection() {
  const { t } = useTranslation();
  const api = window.memoryPanel;

  const [view, setView] = useState<ManagerView>("people");
  const [items, setItems] = useState<MemoryManagerItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [selectedOwn, setSelectedOwn] = useState<string[]>([]);
  const [selectedMentioned, setSelectedMentioned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [trace, setTrace] = useState<{ id: string; text: string; entries: string[] } | null>(null);
  const [erase, setErase] = useState<{ plan: PersonErasePlan; typed: string } | null>(null);

  const load = useCallback(async (next: ManagerView = view) => {
    if (!api) return;
    setLoading(true);
    try {
      const result = await api.listMemoryManager(next);
      const list = result?.items ?? [];
      setItems(list);
      // 丢弃已不存在的勾选项（视图切换/重载后不能留下幽灵 key）
      const alive = new Set(list.map((item) => item.key));
      setSelected((current) => current.filter((key) => alive.has(key)));
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.memory.manager.loadFailed", { error: errorText(error) }) });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api, t, view]);

  useEffect(() => {
    if (!api) { setLoading(false); return; }
    void load("people");
    // 只在挂载时拉一次：后续切视图走 switchView
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return items;
    return items.filter((item) => [item.label, item.key, item.sublabel]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(keyword));
  }, [items, query]);

  const groups = useMemo(() => {
    if (!detail) return { own: [] as MemoryManagerMemory[], mentioned: [] as MemoryManagerMemory[] };
    const personKey = detail.meta?.personKey ?? detail.item.key;
    return groupManagerMemories(detail.memories, view, personKey);
  }, [detail, view]);

  function switchView(next: ManagerView) {
    setView(next);
    setDetail(null);
    setSelected([]);
    setSelectedOwn([]);
    setSelectedMentioned([]);
    setTrace(null);
    setQuery("");
    void load(next);
  }

  async function openDetail(key: string) {
    if (!api) return;
    const item = items.find((entry) => entry.key === key) ?? (detail?.item.key === key ? detail.item : undefined);
    if (!item) return;
    setSelectedOwn([]);
    setSelectedMentioned([]);
    setTrace(null);
    try {
      const result = await api.queryMemoryManager(view, key);
      if (!result) return;
      setDetail({ item, memories: result.memories ?? [], meta: result.meta });
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.memory.manager.actionFailed", { error: errorText(error) }) });
    }
  }

  async function traceSource(memoryId: string) {
    if (!api) return;
    try {
      const result = await api.traceMemorySource(memoryId);
      if (!result || result.missing) { setTrace({ id: memoryId, text: t("settingsPage.memory.manager.traceMissing"), entries: [] }); return; }
      const entries = (result.entries ?? []).map((entry) => {
        const speaker = entry.speakerName || entry.speakerId || entry.role;
        return `[${speaker}] ${entry.content}${entry.file ? ` — ${entry.file}` : ""}`;
      });
      setTrace({ id: memoryId, text: entries.length ? "" : t("settingsPage.memory.manager.traceEmpty"), entries });
    } catch (error) {
      setTrace({ id: memoryId, text: t("settingsPage.memory.manager.traceFailed", { error: errorText(error) }), entries: [] });
    }
  }

  /** 列表批量条：按容器删（每行一个 { view, key }）。 */
  function deleteContainers() {
    if (!api || selected.length === 0) return;
    Modal.confirm({
      title: t("settingsPage.memory.manager.deleteConfirmTitle"),
      content: t("settingsPage.memory.manager.deleteConfirmMessage", { count: selected.length }),
      okText: t("settingsPage.memory.manager.deleteConfirmButton"),
      okButtonProps: { danger: true },
      cancelText: t("settingsPage.memory.manager.cancel"),
      onOk: async () => {
        setBusy("containers");
        let failed = 0;
        let removed = 0;
        for (const key of selected) {
          try {
            const result = await api.deleteMemoryManager({ view, key });
            if (!result) { failed += 1; continue; }
            removed += result.removed ?? 0;
          } catch { failed += 1; }
        }
        setSelected([]);
        setFeedback(failed > 0
          ? { type: "error", text: t("settingsPage.memory.manager.deletePartialFailed", { failed, removed }) }
          : { type: "success", text: t("settingsPage.memory.manager.deleteDone", { removed }) });
        setBusy("");
        await load();
      },
    });
  }

  /** 详情区：删掉勾选的记忆；含 mentioned 组时**先**说明会动到别人的记录。 */
  function deleteMemories() {
    if (!api || !detail) return;
    const ids = [...selectedOwn, ...selectedMentioned];
    if (ids.length === 0) return;
    const speakers = Array.from(new Set(
      detail.memories
        .filter((memory) => selectedMentioned.includes(memory.id))
        .flatMap((memory) => memory.speakerIds ?? []),
    )).join("、") || t("settingsPage.memory.manager.mentionedUnknownSpeaker");
    const run = async () => {
      setBusy("memories");
      try {
        const result = await api.deleteMemoryManager({ ids });
        if (!result) return;
        setSelectedOwn([]);
        setSelectedMentioned([]);
        setFeedback({ type: "success", text: t("settingsPage.memory.manager.deleteDone", { removed: result.removed ?? 0 }) });
        // 列表计数与详情都要重算（getAllL2 换过数组身份，不能复用旧数据）
        await load();
        await openDetail(detail.item.key);
      } catch (error) {
        setFeedback({ type: "error", text: t("settingsPage.memory.manager.deleteFailed", { error: errorText(error) }) });
      } finally { setBusy(""); }
    };
    if (selectedMentioned.length > 0) {
      Modal.confirm({
        title: t("settingsPage.memory.manager.mentionedDeleteTitle"),
        content: t("settingsPage.memory.manager.mentionedDeleteMessage", { count: selectedMentioned.length, speakers }),
        okText: t("settingsPage.memory.manager.mentionedDeleteConfirm"),
        okButtonProps: { danger: true },
        cancelText: t("settingsPage.memory.manager.cancel"),
        onOk: run,
      });
      return;
    }
    void run();
  }

  // ── 三段式「彻底擦除」：① 预演 ② 强确认 ③ 执行 ──

  async function startErase(personKey: string) {
    if (!api || !canErasePersonKey(personKey)) return;
    setBusy("erase-preview");
    try {
      const plan = await api.erasePreview(personKey);
      if (!plan) return;
      setErase({ plan, typed: "" });
      setBusy("");
    } catch (error) {
      setBusy("");
      setFeedback({ type: "error", text: t("settingsPage.memory.manager.erase.previewFailedTitle", { error: errorText(error) }) });
    }
  }

  async function confirmErase() {
    if (!api || !erase || !detail) return;
    const personKey = erase.plan.personKey || detail.item.key;
    const phrase = t("settingsPage.memory.manager.erase.confirmPhrase");
    // 守卫链：personKey 形态 / 严格相等 / previewId 非空 —— 任一不满足绝不执行
    if (!canProceedToErase({ personKey, previewId: erase.plan.previewId, typed: erase.typed, phrase })) return;
    setBusy("erase");
    let report: PersonEraseReport | null = null;
    try {
      report = await api.erasePerson(personKey, erase.plan.previewId as string);
    } catch (error) {
      setBusy("");
      setFeedback({ type: "error", text: t("settingsPage.memory.manager.erase.reportFailedTitle", { error: errorText(error) }) });
      return;
    }
    setBusy("");
    setErase(null);
    if (!report) return;

    const step = nextEraseStep(report, 0);
    if (step !== "done") {
      setFeedback({
        type: "info",
        text: step === "limit"
          ? t("settingsPage.memory.manager.erase.reconfirmLimitReached", { count: report.addedSincePreview ?? 0 })
          : t("settingsPage.memory.manager.erase.needsReconfirm", { count: report.addedSincePreview ?? 0, max: MAX_ERASE_RECONFIRM_ROUNDS }),
      });
      await load();
      await openDetail(detail.item.key);
      // 回到 ① 重新预演（上限由 nextEraseStep 保证，不会无限循环）
      if (step === "reconfirm") await startErase(personKey);
      return;
    }

    setFeedback({
      type: report.partial ? "info" : "success",
      text: report.partial
        ? t("settingsPage.memory.manager.erase.reportPartial", { count: (report.failed ?? []).length })
        : t("settingsPage.memory.manager.erase.reportComplete"),
    });
    setDetail(null);
    await load();
  }

  if (!api) {
    return <section className="cy-settings-section">
      <div className="cy-settings-section__heading"><h2><Users size={18} />{t("settingsPage.memory.manager.title")}</h2></div>
      <Card className="cy-memory-card"><Alert type="error" showIcon message={t("settingsPage.memory.unavailable")} /></Card>
    </section>;
  }

  const erasePhrase = t("settingsPage.memory.manager.erase.confirmPhrase");
  const canErase = detail ? canErasePersonKey(detail.meta?.personKey ?? detail.item.key) && detail.item.erasable === true : false;

  return <section className="cy-settings-section">
    <div className="cy-settings-section__heading">
      <h2><Users size={18} />{t("settingsPage.memory.manager.title")}</h2>
      <p>{t("settingsPage.memory.manager.description")}</p>
    </div>
    {feedback && <Alert className="cy-settings-alert" showIcon type={feedback.type} message={feedback.text} closable onClose={() => setFeedback(null)} />}
    <Card className="cy-memory-card">
      <div className="cy-settings-button-group">
        {MANAGER_VIEWS.map((item) => <Button
          key={item}
          type={view === item && !detail ? "primary" : "default"}
          aria-pressed={view === item}
          onClick={() => switchView(item)}
        >{t(`settingsPage.memory.manager.view.${item}`)}</Button>)}
        <Button icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>{t("settingsPage.memory.manager.refresh")}</Button>
      </div>

      {loading ? <div className="cy-settings-loading"><Spin /></div> : detail ? (
        <div className="cy-memory-manager__detail">
          <div className="cy-memory-card__top">
            <strong>{detail.item.label || detail.item.key}</strong>
            <Button type="text" onClick={() => { setDetail(null); setSelectedOwn([]); setSelectedMentioned([]); setTrace(null); }}>
              {t("settingsPage.memory.manager.closeDetail")}
            </Button>
          </div>
          <p className="cy-settings-intro">{t("settingsPage.memory.manager.detailSummary", {
            total: detail.meta?.total ?? detail.memories.length,
            sessions: detail.meta?.sessions?.length ?? detail.item.sessions ?? 0,
          })}</p>

          {view === "people" ? <>
            <MemoryGroup
              title={t("settingsPage.memory.manager.groupOwn")}
              hint={t("settingsPage.memory.manager.groupOwnHint")}
              memories={groups.own}
              selected={selectedOwn}
              onToggle={(id, checked) => setSelectedOwn((current) => checked ? [...current, id] : current.filter((x) => x !== id))}
              emptyText={t("settingsPage.memory.manager.groupEmpty")}
              onTrace={(id) => void traceSource(id)}
              traceLabel={t("settingsPage.memory.manager.trace")}
            />
            <MemoryGroup
              title={t("settingsPage.memory.manager.groupMentioned")}
              hint={t("settingsPage.memory.manager.groupMentionedHint")}
              memories={groups.mentioned}
              selected={selectedMentioned}
              onToggle={(id, checked) => setSelectedMentioned((current) => checked ? [...current, id] : current.filter((x) => x !== id))}
              emptyText={t("settingsPage.memory.manager.groupEmpty")}
              onTrace={(id) => void traceSource(id)}
              traceLabel={t("settingsPage.memory.manager.trace")}
            />
          </> : <MemoryGroup
            title={t("settingsPage.memory.manager.groupAll")}
            hint={t("settingsPage.memory.manager.groupAllHint")}
            memories={groups.own}
            selected={selectedOwn}
            onToggle={(id, checked) => setSelectedOwn((current) => checked ? [...current, id] : current.filter((x) => x !== id))}
            emptyText={t("settingsPage.memory.manager.groupEmpty")}
            onTrace={(id) => void traceSource(id)}
            traceLabel={t("settingsPage.memory.manager.trace")}
          />}

          {trace && <div className="cy-memory-manager__trace">
            {trace.text && <p>{trace.text}</p>}
            {trace.entries.map((entry, index) => <p className="cy-memory-record" key={`${trace.id}-${index}`}>{entry}</p>)}
          </div>}

          <div className="cy-memory-card__actions">
            <Button danger icon={<Trash2 size={14} />} loading={busy === "memories"} disabled={selectedOwn.length + selectedMentioned.length === 0} onClick={deleteMemories}>
              {t("settingsPage.memory.manager.deleteDetailSelected", { count: selectedOwn.length + selectedMentioned.length })}
            </Button>
            {/* 🔴 「彻底擦除」只在详情区出现（列表行永远拿不到） */}
            {canErase && <Button danger icon={<Eraser size={14} />} loading={busy === "erase-preview"} onClick={() => void startErase(detail.meta?.personKey ?? detail.item.key)}>
              {t("settingsPage.memory.manager.eraseButton")}
            </Button>}
          </div>
          {canErase && <p className="cy-settings-intro">{t("settingsPage.memory.manager.eraseOnlyInDetail")}</p>}
        </div>
      ) : <>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settingsPage.memory.manager.filterPlaceholder")}
          prefix={<Search size={14} />}
          allowClear
        />
        {filtered.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={items.length === 0 ? t("settingsPage.memory.manager.empty") : t("settingsPage.memory.manager.noMatch")} /> : (
          <div className="cy-memory-list">
            {filtered.map((item) => <article className="cy-memory-record" key={item.key}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(item.key)}
                  aria-label={t("settingsPage.memory.manager.selectItem")}
                  onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.key] : current.filter((x) => x !== item.key))}
                />
                <strong>{item.label || item.key}</strong>
              </label>
              {item.sublabel && <span>{item.sublabel}</span>}
              <small>{view === "people"
                ? t("settingsPage.memory.manager.itemPeopleCounts", { own: item.own ?? 0, mentioned: item.mentioned ?? 0, total: item.total ?? 0, sessions: item.sessions ?? 0 })
                : t("settingsPage.memory.manager.itemContainerCounts", { total: item.total ?? 0, sessions: item.sessions ?? 0 })}</small>
              <Button type="text" onClick={() => void openDetail(item.key)}>{t("settingsPage.memory.manager.openDetail")}</Button>
            </article>)}
          </div>
        )}
        <div className="cy-memory-card__actions">
          <Button danger icon={<Trash2 size={14} />} loading={busy === "containers"} disabled={selected.length === 0} onClick={deleteContainers}>
            {t("settingsPage.memory.manager.deleteSelected", { count: selected.length })}
          </Button>
        </div>
      </>}
    </Card>

    {/* ① 预演：先把「会删什么、会留什么」摆出来，再让用户进确认框 */}
    <Modal
      className="cy-settings-theme-modal"
      open={Boolean(erase)}
      width={640}
      title={t("settingsPage.memory.manager.erase.previewTitle", { name: erase?.plan.knownNames?.[0] || erase?.plan.personKey || "" })}
      okText={t("settingsPage.memory.manager.erase.previewContinue")}
      cancelText={t("settingsPage.memory.manager.cancel")}
      onCancel={() => setErase(null)}
      onOk={() => setErase((current) => current && { ...current, typed: "" })}
      footer={null}
    >
      {erase && <ErasePreview plan={erase.plan} />}
    </Modal>

    {/* ② 强确认：必须亲手打出确认短语（严格相等，trim 不算数） */}
    <Modal
      className="cy-settings-theme-modal"
      open={Boolean(erase)}
      title={t("settingsPage.memory.manager.erase.confirmTitle")}
      okText={t("settingsPage.memory.manager.erase.confirmButton")}
      okButtonProps={{ danger: true, disabled: !erase || erase.typed !== erasePhrase, loading: busy === "erase" }}
      cancelText={t("settingsPage.memory.manager.cancel")}
      onCancel={() => setErase(null)}
      onOk={() => void confirmErase()}
    >
      <p>{t("settingsPage.memory.manager.erase.confirmMessage", { name: erase?.plan.knownNames?.[0] || erase?.plan.personKey || "", phrase: erasePhrase })}</p>
      <Input
        value={erase?.typed ?? ""}
        placeholder={erasePhrase}
        onChange={(event) => setErase((current) => current && { ...current, typed: event.target.value })}
      />
      <p className="cy-settings-intro">{t("settingsPage.memory.manager.erase.noRestartNote")}</p>
    </Modal>
  </section>;
}

function MemoryGroup({
  title, hint, memories, selected, onToggle, emptyText, onTrace, traceLabel,
}: {
  title: string;
  hint: string;
  memories: MemoryManagerMemory[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
  emptyText: string;
  onTrace: (id: string) => void;
  traceLabel: string;
}) {
  const { t } = useTranslation();
  return <div className="cy-memory-manager__group">
    <div className="cy-memory-card__top"><strong>{title}</strong><span>{memories.length}</span></div>
    <p className="cy-settings-intro">{hint}</p>
    {memories.length === 0 ? <p className="cy-settings-intro">{emptyText}</p> : <div className="cy-memory-list">
      {memories.map((memory) => <article className="cy-memory-record" key={memory.id}>
        <label>
          <input
            type="checkbox"
            checked={selected.includes(memory.id)}
            aria-label={t("settingsPage.memory.manager.selectMemory")}
            onChange={(event) => onToggle(memory.id, event.target.checked)}
          />
          <strong>{memory.content}</strong>
        </label>
        <small>{memory.triggerText || t("settingsPage.memory.noTrigger")} · {t("settingsPage.memory.manager.memoryAt", { source: memory.sourceConversationId || t("settingsPage.memory.manager.unknownSource") })}</small>
        <Button type="text" onClick={() => onTrace(memory.id)}>{traceLabel}</Button>
      </article>)}
    </div>}
  </div>;
}

/** 预演弹窗正文：**将删除**与**保留**必须分成两行写出来（用户的知情权）。 */
function ErasePreview({ plan }: { plan: PersonErasePlan }) {
  const { t } = useTranslation();
  const keptSamples = (plan.l2?.keptSamples ?? []).slice(0, SAMPLE_LIMIT);
  const preserved = (plan.preservedPaths ?? []).slice(0, PRESERVED_LIMIT);
  const residues = (plan.residues ?? []).slice(0, RESIDUE_LIMIT);
  const sessions = plan.sessions ?? [];
  const backups = plan.memoryBackups ?? { files: 0, bytes: 0 };
  const decompress = plan.summaries?.decompress?.length ?? 0;
  const remove = plan.summaries?.remove?.length ?? 0;

  return <div className="cy-memory-manager__preview">
    <p><strong>{t("settingsPage.memory.manager.erase.willDelete", { count: plan.l2?.total ?? 0 })}</strong></p>
    <p>{t("settingsPage.memory.manager.erase.willDeleteBreakdown", {
      speaker: plan.l2?.byRule?.speaker ?? 0,
      private: plan.l2?.byRule?.private ?? 0,
      summaries: decompress + remove,
      decompressed: decompress,
    })}</p>
    {/* ② 保留：别人提到他 —— 独立一行，用户要能一眼看出"会留什么" */}
    <p><strong>{t("settingsPage.memory.manager.erase.keptMentioned", { count: plan.l2?.keptSubjectOnly ?? 0 })}</strong></p>
    {keptSamples.length > 0 && <ul>{keptSamples.map((sample, index) => <li key={index}>{sample.content}</li>)}</ul>}
    <p>{t("settingsPage.memory.manager.erase.corpusUntouched")}</p>
    {preserved.length > 0 && <>
      <p><strong>{t("settingsPage.memory.manager.erase.preservedLead")}</strong></p>
      <ul>{preserved.map((path) => <li key={path}>{path}</li>)}</ul>
    </>}
    {sessions.length > 0 && <>
      <p><strong>{t("settingsPage.memory.manager.erase.sessionsTitle", { count: sessions.length })}</strong></p>
      <ul>{sessions.map((session) => <li key={session.sessionId}>{t("settingsPage.memory.manager.erase.sessionLine", {
        sessionId: session.sessionId, kind: session.kind, l2: session.l2Count ?? 0,
        hot: session.hotLines ?? 0, archive: session.archiveLines ?? 0, assistant: session.assistantLines ?? 0,
      })}</li>)}</ul>
    </>}
    <p><strong>{t("settingsPage.memory.manager.erase.peripheralTitle")}</strong></p>
    <p>{t("settingsPage.memory.manager.erase.peripheralLine", {
      vectors: plan.vectors ?? 0, chatVectors: plan.chatHistoryVectors ?? 0,
      evidence: plan.evidence ?? 0, dmae: plan.dmaeStates ?? 0,
      conflicts: plan.conflictLogs ?? 0, reflections: plan.reflectionLogs ?? 0,
    })}</p>
    {/* 整份销毁的两个载体：备份（回退能力）与调试日志（完整 prompt 正文） */}
    <p><strong>{t("settingsPage.memory.manager.erase.backupsLine", { files: backups.files, size: bytesText(backups.bytes) })}</strong></p>
    <p><strong>{plan.apiLog?.exists
      ? t("settingsPage.memory.manager.erase.apiLogLine", { size: bytesText(plan.apiLog.bytes) })
      : t("settingsPage.memory.manager.erase.apiLogAbsent")}</strong></p>
    {residues.length > 0 && <>
      <p><strong>{t("settingsPage.memory.manager.erase.residuesTitle", { count: (plan.residues ?? []).length })}</strong></p>
      <ul>{residues.map((residue, index) => <li key={index}>{`${residue.kind} · ${residue.file}`}</li>)}</ul>
    </>}
    {(plan.warnings ?? []).length > 0 && <ul>{(plan.warnings ?? []).map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
  </div>;
}
