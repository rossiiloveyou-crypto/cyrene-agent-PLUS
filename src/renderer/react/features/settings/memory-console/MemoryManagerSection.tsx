// P9 T2 · 记忆管理台（React 重写）。
//
// 对应旧面板 `src/renderer/settings/memory/manager.ts`（H-07 保留的「里子」模块，只读参照）。
// 保留的能力与**硬约束**（照抄里子模块注释里写死的三条，别在重写时丢掉）：
//   1) 「彻底擦除」**只在详情区**出现，列表行永远拿不到它（最危险的动作不放列表里，防误点）；
//   2) 详情区把「🗣 他的记忆」与「👥 别人提到他」**分开显示、分开勾选**；
//      删 mentioned 组前必须先弹一句「会连带动到别人的记录」的警告；
//   3) 三段式擦除：预演 → 强确认 → 执行；任一守卫不满足**绝不调用 erasePerson**。
//
// 🔴 **P9.5 修复（H-19）**：本文件的类名**一律对齐旧面板的 `memory-manager__*`**，
//    且 DOM 结构刻意做成**旧结构的扁平形态**（如 `.memory-manager__row` 的 4 列网格要求
//    checkbox / name / id / meta 是**同一个父节点的直接子元素**）。
//    样式在 `./MemoryConsole.css`（旧 settings.css 的 75 条选择器回收 + 令牌化）。
//    ⚠️ **不要**把子元素再包一层 `<label>` 或 `<div>` —— 那会让旧 CSS 的
//    `grid-template-columns` 失去落点，正是 P9 里"文字叠在一起"的成因（判据台账 J-32）。
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
import "./MemoryConsole.css";

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

function feedbackClass(feedback: Feedback): string {
  if (!feedback) return "memory-manager__feedback";
  if (feedback.type === "success") return "memory-manager__feedback memory-manager__feedback--ok";
  if (feedback.type === "error") return "memory-manager__feedback memory-manager__feedback--err";
  return "memory-manager__feedback";
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
  const [trace, setTrace] = useState<{ id: string; text: string; entries: Array<{ speaker: string; text: string; meta: string }> } | null>(null);
  // `round` = 本轮擦除的**回归轮次**（0 起），与里子模块 `erasure-flow.ts:423` 的 `for` 变量同语义：
  // 首次预演=0，每「预演后又新增记忆」重来一次则 +1；`nextEraseStep(report, round)` 的 `limit` 分支靠它才可达。
  const [erase, setErase] = useState<{ plan: PersonErasePlan; typed: string; round: number } | null>(null);

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
      const entries = (result.entries ?? []).map((entry) => ({
        speaker: entry.speakerName || entry.speakerId || entry.role,
        text: entry.content,
        meta: [entry.at, entry.file].filter(Boolean).join(" · "),
      }));
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

  async function startErase(personKey: string, round = 0) {
    if (!api || !canErasePersonKey(personKey)) return;
    setBusy("erase-preview");
    try {
      const plan = await api.erasePreview(personKey);
      if (!plan) return;
      setErase({ plan, typed: "", round });
      setBusy("");
    } catch (error) {
      setBusy("");
      setFeedback({ type: "error", text: t("settingsPage.memory.manager.erase.previewFailedTitle", { error: errorText(error) }) });
    }
  }

  async function confirmErase() {
    if (!api || !erase || !detail) return;
    const personKey = erase.plan.personKey || detail.item.key;
    // 🔴 本轮轮次必须在 `setErase(null)` **之前**取出（否则下面的回归判定拿不到真实轮次）。
    //   P10 T6②：这里原来是「上限常量**减去它自己**」（恒等于 0）→
    //   `nextEraseStep` 的 `limit` 分支**永不可达**，"重确认上限"形同虚设、文案 `reconfirmLimitReached` 是死文案。
    //   ⚠️ 本条注释刻意**不写出那个表达式**：`rules.test.ts` 有一条源码级守卫按字面量搜它（防复发）。
    const round = erase.round;
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

    const step = nextEraseStep(report, round);
    if (step !== "done") {
      setFeedback({
        type: "info",
        text: step === "limit"
          ? t("settingsPage.memory.manager.erase.reconfirmLimitReached", { count: report.addedSincePreview ?? 0 })
          : t("settingsPage.memory.manager.erase.needsReconfirm", { count: report.addedSincePreview ?? 0, max: MAX_ERASE_RECONFIRM_ROUNDS }),
      });
      await load();
      await openDetail(detail.item.key);
      // 回到 ① 重新预演（上限由 nextEraseStep(report, round) 保证：轮次真正递增，不会无限循环）
      if (step === "reconfirm") await startErase(personKey, round + 1);
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
  const selectedMemoryCount = selectedOwn.length + selectedMentioned.length;

  return <section className="cy-settings-section">
    <div className="cy-settings-section__heading">
      <h2><Users size={18} />{t("settingsPage.memory.manager.title")}</h2>
      <p>{t("settingsPage.memory.manager.description")}</p>
    </div>
    <Card className="cy-memory-card">
      {/* 工具栏：三视图切换 + 刷新（旧 `memory-manager__toolbar`） */}
      <div className="memory-manager__toolbar">
        <div className="memory-manager__views">
          {MANAGER_VIEWS.map((item) => <Button
            key={item}
            type={view === item ? "primary" : "default"}
            aria-pressed={view === item}
            onClick={() => switchView(item)}
          >{t(`settingsPage.memory.manager.view.${item}`)}</Button>)}
        </div>
        <Button icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>{t("settingsPage.memory.manager.refresh")}</Button>
        <p className={feedbackClass(feedback)} role="status">{feedback?.text ?? ""}</p>
      </div>

      {loading ? <div className="cy-settings-loading"><Spin /></div> : detail ? (
        /* ── 详情两态：详情区（旧 `memory-manager__detail`） ── */
        <div className="memory-manager__detail">
          <div className="memory-manager__detail-head">
            <h3>{detail.item.label || detail.item.key}</h3>
            <Button type="text" onClick={() => { setDetail(null); setSelectedOwn([]); setSelectedMentioned([]); setTrace(null); }}>
              {t("settingsPage.memory.manager.closeDetail")}
            </Button>
          </div>
          <p className="memory-manager__detail-summary">{t("settingsPage.memory.manager.detailSummary", {
            total: detail.meta?.total ?? detail.memories.length,
            sessions: detail.meta?.sessions?.length ?? detail.item.sessions ?? 0,
          })}</p>

          {view === "people" ? <>
            <MemoryGroup
              variant="own"
              title={t("settingsPage.memory.manager.groupOwn")}
              hint={t("settingsPage.memory.manager.groupOwnHint")}
              memories={groups.own}
              selected={selectedOwn}
              onToggle={(id, checked) => setSelectedOwn((current) => checked ? [...current, id] : current.filter((x) => x !== id))}
              emptyText={t("settingsPage.memory.manager.groupEmpty")}
              onTrace={(id) => void traceSource(id)}
              traceLabel={t("settingsPage.memory.manager.trace")}
              t={t}
            />
            <MemoryGroup
              variant="mentioned"
              title={t("settingsPage.memory.manager.groupMentioned")}
              hint={t("settingsPage.memory.manager.groupMentionedHint")}
              memories={groups.mentioned}
              selected={selectedMentioned}
              onToggle={(id, checked) => setSelectedMentioned((current) => checked ? [...current, id] : current.filter((x) => x !== id))}
              emptyText={t("settingsPage.memory.manager.groupEmpty")}
              onTrace={(id) => void traceSource(id)}
              traceLabel={t("settingsPage.memory.manager.trace")}
              t={t}
            />
          </> : <MemoryGroup
            variant="own"
            title={t("settingsPage.memory.manager.groupAll")}
            hint={t("settingsPage.memory.manager.groupAllHint")}
            memories={groups.own}
            selected={selectedOwn}
            onToggle={(id, checked) => setSelectedOwn((current) => checked ? [...current, id] : current.filter((x) => x !== id))}
            emptyText={t("settingsPage.memory.manager.groupEmpty")}
            onTrace={(id) => void traceSource(id)}
            traceLabel={t("settingsPage.memory.manager.trace")}
            t={t}
          />}

          {trace && <div className="memory-manager__trace">
            {trace.text && <p className="memory-manager__trace-empty">{trace.text}</p>}
            {trace.entries.map((entry, index) => <div className="memory-manager__trace-line" key={`${trace.id}-${index}`}>
              <span className="memory-manager__trace-speaker">{`[${entry.speaker}]:`}</span>
              <span className="memory-manager__trace-text">{entry.text}</span>
              <span className="memory-manager__trace-meta">{entry.meta}</span>
            </div>)}
          </div>}

          <div className="memory-manager__detail-actions">
            <Button danger icon={<Trash2 size={14} />} loading={busy === "memories"} disabled={selectedMemoryCount === 0} onClick={deleteMemories}>
              {t("settingsPage.memory.manager.deleteDetailSelected", { count: selectedMemoryCount })}
            </Button>
            {/* 🔴 「彻底擦除」只在详情区出现（列表行永远拿不到） */}
            {canErase && <Button danger icon={<Eraser size={14} />} loading={busy === "erase-preview"} onClick={() => void startErase(detail.meta?.personKey ?? detail.item.key)}>
              {t("settingsPage.memory.manager.eraseButton")}
            </Button>}
          </div>
          {canErase && <p className="memory-manager__group-hint">{t("settingsPage.memory.manager.eraseOnlyInDetail")}</p>}
        </div>
      ) : <>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settingsPage.memory.manager.filterPlaceholder")}
          prefix={<Search size={14} />}
          allowClear
        />
        {filtered.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={items.length === 0 ? t("settingsPage.memory.manager.empty") : t("settingsPage.memory.manager.noMatch")} />
          : <div className="memory-manager__list">
            {filtered.map((item) => <div className={`memory-manager__row${selected.includes(item.key) ? " is-selected" : ""}`} key={item.key}>
              <label className="memory-manager__row-check">
                <input
                  type="checkbox"
                  checked={selected.includes(item.key)}
                  aria-label={t("settingsPage.memory.manager.selectItem")}
                  onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.key] : current.filter((x) => x !== item.key))}
                />
              </label>
              <span className="memory-manager__row-name">{item.label || item.key}</span>
              {item.sublabel && <span className="memory-manager__row-id">{item.sublabel}</span>}
              <span className="memory-manager__row-meta">{view === "people"
                ? t("settingsPage.memory.manager.itemPeopleCounts", { own: item.own ?? 0, mentioned: item.mentioned ?? 0, total: item.total ?? 0, sessions: item.sessions ?? 0 })
                : t("settingsPage.memory.manager.itemContainerCounts", { total: item.total ?? 0, sessions: item.sessions ?? 0 })}</span>
              <Button type="text" onClick={() => void openDetail(item.key)}>{t("settingsPage.memory.manager.openDetail")}</Button>
            </div>)}
          </div>}
        <div className="memory-manager__detail-actions">
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
      cancelText={t("settingsPage.memory.manager.cancel")}
      onCancel={() => setErase(null)}
      footer={null}
    >
      {erase && <ErasePreview plan={erase.plan} t={t} />}
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
      <p className="memory-manager__group-hint">{t("settingsPage.memory.manager.erase.noRestartNote")}</p>
    </Modal>
  </section>;
}

function MemoryGroup({
  variant, title, hint, memories, selected, onToggle, emptyText, onTrace, traceLabel, t,
}: {
  variant: "own" | "mentioned";
  title: string;
  hint: string;
  memories: MemoryManagerMemory[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
  emptyText: string;
  onTrace: (id: string) => void;
  traceLabel: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return <section className={`memory-manager__group memory-manager__group--${variant}`}>
    <div className="memory-manager__group-head">
      <strong className="memory-manager__group-title">{title}</strong>
      <span className="memory-manager__group-count">{t("settingsPage.memory.manager.groupCount", { count: memories.length })}</span>
      <span className="memory-manager__group-selected">{t("settingsPage.memory.manager.groupSelected", { count: selected.length })}</span>
    </div>
    <p className="memory-manager__group-hint">{hint}</p>
    <div className="memory-manager__group-rows">
      {memories.length === 0
        ? <p className="memory-manager__group-empty">{emptyText}</p>
        : memories.map((memory) => <div className={`memory-manager__memory${selected.includes(memory.id) ? " is-selected" : ""}`} key={memory.id}>
          <label className="memory-manager__memory-check">
            <input
              type="checkbox"
              checked={selected.includes(memory.id)}
              aria-label={t("settingsPage.memory.manager.selectMemory")}
              onChange={(event) => onToggle(memory.id, event.target.checked)}
            />
          </label>
          <div className="memory-manager__memory-main">
            <p className="memory-manager__memory-body">{memory.content}</p>
            <p className="memory-manager__memory-meta">{[
              memory.triggerText || t("settingsPage.memory.noTrigger"),
              t("settingsPage.memory.manager.memoryAt", { source: memory.sourceConversationId || t("settingsPage.memory.manager.unknownSource") }),
              memory.isSummary
                ? t("settingsPage.memory.manager.memorySummary", { count: memory.subEntryCount ?? 0 })
                : t("settingsPage.memory.manager.memoryStatus", { status: memory.status }),
            ].join(" · ")}</p>
          </div>
          <Button type="text" onClick={() => onTrace(memory.id)}>{traceLabel}</Button>
        </div>)}
    </div>
  </section>;
}

/** 预演弹窗正文：**将删除**与**保留**必须分成两行写出来（用户的知情权）。 */
function ErasePreview({ plan, t }: { plan: PersonErasePlan; t: (key: string, options?: Record<string, unknown>) => string }) {
  const keptSamples = (plan.l2?.keptSamples ?? []).slice(0, SAMPLE_LIMIT);
  const preserved = (plan.preservedPaths ?? []).slice(0, PRESERVED_LIMIT);
  const residues = (plan.residues ?? []).slice(0, RESIDUE_LIMIT);
  const sessions = plan.sessions ?? [];
  const backups = plan.memoryBackups ?? { files: 0, bytes: 0 };
  const decompress = plan.summaries?.decompress?.length ?? 0;
  const remove = plan.summaries?.remove?.length ?? 0;

  return <div className="memory-manager__preview">
    <p className="memory-manager__memory-body">{t("settingsPage.memory.manager.erase.willDelete", { count: plan.l2?.total ?? 0 })}</p>
    <p className="memory-manager__memory-meta">{t("settingsPage.memory.manager.erase.willDeleteBreakdown", {
      speaker: plan.l2?.byRule?.speaker ?? 0,
      private: plan.l2?.byRule?.private ?? 0,
      summaries: decompress + remove,
      decompressed: decompress,
    })}</p>
    {/* ② 保留：别人提到他 —— 独立一行，用户要能一眼看出"会留什么" */}
    <p className="memory-manager__memory-body">{t("settingsPage.memory.manager.erase.keptMentioned", { count: plan.l2?.keptSubjectOnly ?? 0 })}</p>
    {keptSamples.length > 0 && <ul className="memory-manager__preview-list">
      {keptSamples.map((sample, index) => <li key={index}>{sample.content}</li>)}
    </ul>}
    <p className="memory-manager__group-hint">{t("settingsPage.memory.manager.erase.corpusUntouched")}</p>
    {preserved.length > 0 && <>
      <p className="memory-manager__memory-body">{t("settingsPage.memory.manager.erase.preservedLead")}</p>
      <ul className="memory-manager__preview-list">{preserved.map((path) => <li key={path}>{path}</li>)}</ul>
    </>}
    {sessions.length > 0 && <>
      <p className="memory-manager__memory-body">{t("settingsPage.memory.manager.erase.sessionsTitle", { count: sessions.length })}</p>
      <ul className="memory-manager__preview-list">{sessions.map((session) => <li key={session.sessionId}>{t("settingsPage.memory.manager.erase.sessionLine", {
        sessionId: session.sessionId, kind: session.kind, l2: session.l2Count ?? 0,
        hot: session.hotLines ?? 0, archive: session.archiveLines ?? 0, assistant: session.assistantLines ?? 0,
      })}</li>)}</ul>
    </>}
    <p className="memory-manager__memory-body">{t("settingsPage.memory.manager.erase.peripheralTitle")}</p>
    <p className="memory-manager__memory-meta">{t("settingsPage.memory.manager.erase.peripheralLine", {
      vectors: plan.vectors ?? 0, chatVectors: plan.chatHistoryVectors ?? 0,
      evidence: plan.evidence ?? 0, dmae: plan.dmaeStates ?? 0,
      conflicts: plan.conflictLogs ?? 0, reflections: plan.reflectionLogs ?? 0,
    })}</p>
    {/* 整份销毁的两个载体：备份（回退能力）与调试日志（完整 prompt 正文） */}
    <p className="memory-manager__memory-body">{t("settingsPage.memory.manager.erase.backupsLine", { files: backups.files, size: bytesText(backups.bytes) })}</p>
    <p className="memory-manager__memory-body">{plan.apiLog?.exists
      ? t("settingsPage.memory.manager.erase.apiLogLine", { size: bytesText(plan.apiLog.bytes) })
      : t("settingsPage.memory.manager.erase.apiLogAbsent")}</p>
    {residues.length > 0 && <>
      <p className="memory-manager__memory-body">{t("settingsPage.memory.manager.erase.residuesTitle", { count: (plan.residues ?? []).length })}</p>
      <ul className="memory-manager__preview-list">{residues.map((residue, index) => <li key={index}>{`${residue.kind} · ${residue.file}`}</li>)}</ul>
    </>}
    {(plan.warnings ?? []).length > 0 && <ul className="memory-manager__preview-list">
      {(plan.warnings ?? []).map((warning, index) => <li key={index}>{warning}</li>)}
    </ul>}
  </div>;
}
