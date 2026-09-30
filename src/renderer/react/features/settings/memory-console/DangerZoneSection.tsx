// P9 T2 · 记忆页「危险区」区块。
//
// 两个能力（对应台账 H-02 与 H-03，旧面板实现见里子模块 `memory/delete-all.ts`）：
//   ① 群聊近期上下文条数 `groupContextLimit`（H-02 / 作业单 B-8）
//   ② 「删除全部记忆」：强确认词 → deleteAll() → **必须重启**（H-03 / 作业单 B-9）
//
// 🔴 重启语义（preload/index.ts:610 注释，P9 Y4）：deleteAll() 之后**必须** restartApp()。
//    进程内还有 memoryStore / entityGraph / JsonVectorStore 三处缓存，
//    不重启就会把旧数据写回磁盘 —— 所以 UI 上必须把这件事明确告知用户，不能静默跳过。
//
// ⚠️ 与「按人擦除」的关键差异（`erasure-flow.ts:8-11` 写明的三条）：
//    擦除**不需要**重启（缓存原地失效）；本区块的两个动作都**不受**此豁免。

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, InputNumber, Modal, Spin } from "antd";
import { AlertTriangle, RefreshCcw, Trash2 } from "lucide-react";
import type { DeleteAllMemoryResult } from "../../../../settings/shared/types";
import { useTranslation } from "../../../i18n";
import { Card } from "../../../components/ui/Card";
import {
  DEFAULT_GROUP_CONTEXT_LIMIT,
  DELETE_ALL_CONFIRM_PHRASE_FALLBACK,
  describeDeleteAllFailure,
  errorText,
  isDeleteAllConfirmed,
  isGroupContextLimitValid,
  MAX_GROUP_CONTEXT_LIMIT,
  MIN_GROUP_CONTEXT_LIMIT,
  normalizeGroupContextLimit,
} from "./rules";

type Feedback = { type: "success" | "error" | "info"; text: string } | null;

export function DangerZoneSection() {
  const { t } = useTranslation();
  const [limit, setLimit] = useState<number | null>(DEFAULT_GROUP_CONTEXT_LIMIT);
  const [savedLimit, setSavedLimit] = useState<number>(DEFAULT_GROUP_CONTEXT_LIMIT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deletedPaths, setDeletedPaths] = useState<string[]>([]);

  const phrase = t("settingsPage.memory.danger.confirmPhrase") || DELETE_ALL_CONFIRM_PHRASE_FALLBACK;

  const load = useCallback(async () => {
    if (!window.settings) { setLoading(false); return; }
    try {
      const config = await window.settings.getGeneral();
      const value = normalizeGroupContextLimit(
        (config as { groupContextLimit?: unknown }).groupContextLimit,
        DEFAULT_GROUP_CONTEXT_LIMIT, MIN_GROUP_CONTEXT_LIMIT, MAX_GROUP_CONTEXT_LIMIT,
      );
      setLimit(value);
      setSavedLimit(value);
    } catch {
      setFeedback({ type: "error", text: t("settingsPage.memory.danger.loadFailed") });
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  async function saveLimit() {
    if (!window.settings || limit === null) return;
    if (!isGroupContextLimitValid(limit, MIN_GROUP_CONTEXT_LIMIT, MAX_GROUP_CONTEXT_LIMIT)) return;
    setBusy("limit");
    try {
      await window.settings.saveGeneral({ groupContextLimit: limit } as never);
      setSavedLimit(limit);
      setFeedback({ type: "success", text: t("settingsPage.memory.danger.limitSaved") });
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.memory.danger.limitSaveFailed", { error: errorText(error) }) });
    } finally { setBusy(""); }
  }

  /** 删除全部记忆 → 展示失败清单（若有）→ 提示重启。 */
  async function runDeleteAll() {
    const api = window.memoryPanel;
    if (!api || !isDeleteAllConfirmed(typed, phrase)) return;
    setBusy("delete-all");
    let result: DeleteAllMemoryResult | undefined;
    try {
      result = await api.deleteAll();
    } catch (error) {
      setBusy("");
      setConfirmOpen(false);
      setTyped("");
      setFeedback({ type: "error", text: t("settingsPage.memory.danger.deleteFailed", { error: errorText(error) }) });
      return;
    }
    setBusy("");
    setConfirmOpen(false);
    setTyped("");
    if (!result) return;

    if (!result.ok) {
      setFeedback({ type: "error", text: t("settingsPage.memory.danger.deletePartial", {
        paths: describeDeleteAllFailure(result.failed ?? []),
      }) });
      return;
    }
    setDeletedPaths(result.deleted ?? []);
    setFeedback({ type: "success", text: t("settingsPage.memory.danger.deleteDone", { count: (result.deleted ?? []).length }) });
  }

  /** 🔴 deleteAll 之后必须重启（Y4）：进程内缓存不重启就会把旧数据写回磁盘。 */
  function restartNow() {
    void window.memoryPanel?.restartApp();
  }

  const dirty = limit !== null && limit !== savedLimit;

  return <section className="cy-settings-section">
    <div className="cy-settings-section__heading">
      <h2><AlertTriangle size={18} />{t("settingsPage.memory.danger.title")}</h2>
      <p>{t("settingsPage.memory.danger.description")}</p>
    </div>
    {feedback && <Alert className="cy-settings-alert" showIcon type={feedback.type} message={feedback.text} closable onClose={() => setFeedback(null)} />}
    {loading ? <div className="cy-settings-loading"><Spin /></div> : <Card className="cy-memory-card">
      {/* ① 群聊近期上下文条数（H-02 / B-8） */}
      <div className="cy-settings-row">
        <div className="cy-settings-row__copy">
          <strong>{t("settingsPage.memory.danger.limitTitle")}</strong>
          <span>{t("settingsPage.memory.danger.limitDescription", { min: MIN_GROUP_CONTEXT_LIMIT, max: MAX_GROUP_CONTEXT_LIMIT, default: DEFAULT_GROUP_CONTEXT_LIMIT })}</span>
        </div>
        <div className="cy-settings-row__control cy-settings-button-group">
          <InputNumber
            min={MIN_GROUP_CONTEXT_LIMIT}
            max={MAX_GROUP_CONTEXT_LIMIT}
            step={1}
            precision={0}
            value={limit}
            aria-label={t("settingsPage.memory.danger.limitTitle")}
            onChange={(value) => setLimit(typeof value === "number" ? value : null)}
          />
          <Button
            type="primary"
            loading={busy === "limit"}
            disabled={!dirty || !isGroupContextLimitValid(limit, MIN_GROUP_CONTEXT_LIMIT, MAX_GROUP_CONTEXT_LIMIT)}
            onClick={() => void saveLimit()}
          >{t("settingsPage.memory.save")}</Button>
          <Button icon={<RefreshCcw size={14} />} onClick={() => { setLimit(savedLimit); void load(); }}>{t("settingsPage.memory.manager.refresh")}</Button>
        </div>
      </div>

      {/* ② 删除全部记忆（H-03 / B-9）：强确认词 + 二次确认 + 重启 */}
      <div className="cy-settings-row">
        <div className="cy-settings-row__copy">
          <strong>{t("settingsPage.memory.danger.deleteAllTitle")}</strong>
          <span>{t("settingsPage.memory.danger.deleteAllDescription")}</span>
        </div>
        <div className="cy-settings-row__control cy-settings-button-group">
          <Button danger icon={<Trash2 size={14} />} onClick={() => { setTyped(""); setConfirmOpen(true); }}>
            {t("settingsPage.memory.danger.deleteAllButton")}
          </Button>
        </div>
      </div>

      {/* 删除成功后：把「必须重启」与「已删除什么」摆出来，并给一个立刻重启的入口 */}
      {deletedPaths.length > 0 && <div className="cy-memory-card__actions">
        <Alert
          type="warning"
          showIcon
          message={t("settingsPage.memory.danger.restartRequired")}
          description={t("settingsPage.memory.danger.restartDescription")}
        />
        <Button type="primary" danger onClick={restartNow}>{t("settingsPage.memory.danger.restartNow")}</Button>
      </div>}
    </Card>}

    {/* 强确认：必须亲手打出确认短语；规则照抄 delete-all.ts（严格相等，trim 不算数） */}
    <Modal
      className="cy-settings-theme-modal"
      open={confirmOpen}
      title={t("settingsPage.memory.danger.confirmTitle")}
      okText={t("settingsPage.memory.danger.confirmButton")}
      okButtonProps={{ danger: true, disabled: !isDeleteAllConfirmed(typed, phrase), loading: busy === "delete-all" }}
      cancelText={t("settingsPage.memory.manager.cancel")}
      onCancel={() => { setConfirmOpen(false); setTyped(""); }}
      onOk={() => void runDeleteAll()}
    >
      <p>{t("settingsPage.memory.danger.confirmMessage", { phrase })}</p>
      <Input value={typed} placeholder={phrase} onChange={(event) => setTyped(event.target.value)} />
      <p className="cy-settings-intro">{t("settingsPage.memory.danger.restartHint")}</p>
    </Modal>
  </section>;
}
