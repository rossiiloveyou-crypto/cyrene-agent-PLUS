import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "../../../i18n";
import {
  buildKeywordsPatch,
  keywordsToText,
  mergeKeywordText,
  resolveKeywordsAfterSave,
  type KeywordConfig,
} from "./channel-keywords";
import "./ToolConsolePanel.css";

/** 与主进程 channels/types.ts 对齐的渠道 id（渲染端不 import 主进程模块） */
type ConsoleChannelId = "wechat" | "feishu" | "qq" | "qqbot";
type ConsoleChatType = "private" | "group";
type AccessPermission = "private" | "group" | "tool";
type AuditStatus = "success" | "failure" | "blocked";
type AuditKind = "tool_call" | "message_blocked" | "turn_failed" | "turn_success";
type AuditTrigger = "mention" | "trigger_keyword" | "private" | "unknown";

interface AccessPermissions {
  private: boolean;
  group: boolean;
  tool: boolean;
}

interface AllowlistEntry {
  channel: ConsoleChannelId;
  userId: string;
  label?: string;
  addedAt: number;
  permissions: AccessPermissions;
}

interface ToolAccessConfig {
  /** 群员发言限制：开 = 群聊按「群聊」权限校验 */
  groupMemberGate: boolean;
  /** 工具调用拦截：开 = 工具调用按「工具」权限校验（私聊 + 群聊） */
  toolGate: boolean;
  entries: AllowlistEntry[];
}

/** 新增条目的默认权限：默认只获得群聊响应权限（与主进程 tool-access 保持一致）。 */
const DEFAULT_PERMISSIONS: AccessPermissions = { private: false, group: true, tool: false };

/** 兜底读取权限位：主进程一定会给全，这里再护一层，避免旧主进程 / 热重载让面板崩掉。 */
function permissionsOf(entry: AllowlistEntry): AccessPermissions {
  const raw = (entry.permissions ?? {}) as Partial<AccessPermissions>;
  return {
    private: raw.private === true,
    group: raw.group !== false,
    tool: raw.tool === true,
  };
}

const PERMISSION_OPTIONS: Array<{ id: AccessPermission; labelKey: string; descKey: string }> = [
  { id: "private", labelKey: "toolConsole.permissionPrivate", descKey: "toolConsole.permissionPrivateDesc" },
  { id: "group", labelKey: "toolConsole.permissionGroup", descKey: "toolConsole.permissionGroupDesc" },
  { id: "tool", labelKey: "toolConsole.permissionTool", descKey: "toolConsole.permissionToolDesc" },
];

interface AuditEntry {
  id: string;
  at: number;
  kind: AuditKind;
  status: AuditStatus;
  channel: ConsoleChannelId;
  chatType: ConsoleChatType;
  chatId: string;
  senderId: string;
  senderName?: string;
  sessionId?: string;
  title: string;
  summary: string;
  reason?: string;
  trigger?: AuditTrigger;
  toolName?: string;
  toolId?: string;
  args?: Record<string, unknown>;
  allowlisted?: boolean | null;
  durationMs?: number;
  userText?: string;
  logPath?: string;
}

interface AuditFilter {
  kind: "all" | "blocked" | "failed" | "success";
}

interface ToolConsoleApi {
  channelsToolAccessGet?: () => Promise<ToolAccessConfig>;
  channelsToolAccessSave?: (patch: unknown) => Promise<ToolAccessConfig>;
  channelsAuditGet?: (limit?: number) => Promise<AuditEntry[]>;
  channelsAuditClear?: () => Promise<{ ok: boolean }>;
  channelsAuditOpenLog?: (id: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  channelsAuditRevealLog?: (id: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  onChannelsAudit?: (callback: (entry: AuditEntry) => void) => () => void;
  channelsGetConfig?: () => Promise<{ audit?: { recordSuccessTurns?: boolean }; keywords?: Partial<KeywordConfig> }>;
  channelsSaveConfig?: (patch: unknown) => Promise<unknown>;
  channelsKeywordsImportTxt?: () => Promise<
    { ok: true; keywords: string[]; fileName?: string } | { ok: false; canceled?: boolean; error?: string }
  >;
}

/*
 * 关键词策略的纯逻辑（文本 ↔ 数组、导入合并、保存回填）在 `./channel-keywords`，
 * 单独成文件以便直接单测（面板组件在 SSR 下停在 loading 分支，交互没法静态断言）。
 */

const AUDIT_LIMIT = 400;

const CHANNEL_OPTIONS: Array<{ id: ConsoleChannelId; labelKey: string }> = [
  { id: "qq", labelKey: "toolConsole.channelQq" },
  { id: "qqbot", labelKey: "toolConsole.channelQqBot" },
  { id: "wechat", labelKey: "toolConsole.channelWechat" },
  { id: "feishu", labelKey: "toolConsole.channelFeishu" },
];

const KIND_LABELS: Record<AuditKind, string> = {
  tool_call: "toolConsole.kindToolCall",
  message_blocked: "toolConsole.kindMessageBlocked",
  turn_failed: "toolConsole.kindTurnFailed",
  turn_success: "toolConsole.kindTurnSuccess",
};

const TRIGGER_LABELS: Record<AuditTrigger, string> = {
  mention: "toolConsole.triggerMention",
  trigger_keyword: "toolConsole.triggerKeyword",
  private: "toolConsole.triggerPrivate",
  unknown: "toolConsole.triggerUnknown",
};

function consoleApi(): ToolConsoleApi | undefined {
  return (window as typeof window & { settings?: ToolConsoleApi }).settings;
}

function formatTime(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 列表副文案：优先展示命令 / 路径 / 查询词这类关键参数。 */
function summarizeArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const keys = ["command", "path", "file", "url", "query", "text", "name", "id"];
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const json = JSON.stringify(args);
  return json === "{}" || json === undefined ? "" : json;
}

export function ToolConsolePanel() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ToolAccessConfig | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [recordSuccess, setRecordSuccess] = useState(false);
  /** 关键词策略：按行文本编辑，保存时切回数组。 */
  const [interceptText, setInterceptText] = useState("");
  const [triggerText, setTriggerText] = useState("");
  const [keywordsSaving, setKeywordsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<AuditFilter["kind"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftChannel, setDraftChannel] = useState<ConsoleChannelId>("qq");
  const [draftUserId, setDraftUserId] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [auditExpanded, setAuditExpanded] = useState(false);
  /** 当前展开了权限勾选面板的条目 key（`channel:userId`） */
  const [permissionOpenKey, setPermissionOpenKey] = useState<string | null>(null);

  useEffect(() => {
    const api = consoleApi();
    if (!api?.channelsToolAccessGet || !api?.channelsAuditGet) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      api.channelsToolAccessGet(),
      api.channelsAuditGet(AUDIT_LIMIT),
      api.channelsGetConfig?.() ?? Promise.resolve(null),
    ])
      .then(([access, entries, settings]) => {
        if (cancelled) return;
        setConfig(access);
        setAudit(Array.isArray(entries) ? entries : []);
        setRecordSuccess(Boolean(settings?.audit?.recordSuccessTurns));
        setInterceptText(keywordsToText(settings?.keywords?.intercept));
        setTriggerText(keywordsToText(settings?.keywords?.trigger));
      })
      .catch((error) => console.warn("[ToolConsole] 加载失败:", error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const off = api.onChannelsAudit?.((entry) => {
      setAudit((current) => {
        if (current.some((item) => item.id === entry.id)) return current;
        return [entry, ...current].slice(0, AUDIT_LIMIT);
      });
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  // 放大视图：侧边栏一屏只能看几条拦截记录，放大后铺满窗口；Esc 直接还原。
  useEffect(() => {
    if (!auditExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAuditExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [auditExpanded]);

  const persist = useCallback(async (patch: Partial<ToolAccessConfig>) => {
    const api = consoleApi();
    if (!api?.channelsToolAccessSave) return;
    setSaving(true);
    try {
      const saved = await api.channelsToolAccessSave(patch);
      setConfig(saved);
      setNotice(null);
    } catch (error) {
      console.warn("[ToolConsole] 保存失败:", error);
      setNotice(t("toolConsole.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [t]);

  const toggleRecordSuccess = useCallback(async (next: boolean) => {
    const api = consoleApi();
    setRecordSuccess(next);
    if (!api?.channelsSaveConfig) return;
    try {
      await api.channelsSaveConfig({ audit: { recordSuccessTurns: next } });
    } catch (error) {
      console.warn("[ToolConsole] 保存审计开关失败:", error);
      setRecordSuccess(!next);
      setNotice(t("toolConsole.saveFailed"));
    }
  }, [t]);

  /**
   * 保存关键词策略。
   *
   * 主进程 `saveChannelsSettings` 对 keywords 做的是**按字段浅合并**
   * （`settings-store.ts`: `intercept ?? existing`），所以这里必须两类都带上 ——
   * 只传一类会把另一类原样保留，不会误清空。保存后主进程会 `reloadDispatcherSettings()`，
   * 下一轮消息即生效，无需重启。
   */
  const saveKeywords = useCallback(async () => {
    const api = consoleApi();
    if (!api?.channelsSaveConfig) {
      setNotice(t("toolConsole.unavailable"));
      return;
    }
    setKeywordsSaving(true);
    try {
      const saved = (await api.channelsSaveConfig(buildKeywordsPatch(interceptText, triggerText))) as
        | { keywords?: Partial<KeywordConfig> }
        | undefined;
      // 主进程做了去重 / 截断，回填归一化后的结果，避免界面显示与落盘不一致。
      const next = resolveKeywordsAfterSave(saved, { interceptText, triggerText });
      setInterceptText(next.interceptText);
      setTriggerText(next.triggerText);
      setNotice(t("toolConsole.keywordsSaved"));
    } catch (error) {
      console.warn("[ToolConsole] 保存关键词失败:", error);
      setNotice(t("toolConsole.saveFailed"));
    } finally {
      setKeywordsSaving(false);
    }
  }, [interceptText, triggerText, t]);

  /** 导入 txt：主进程弹文件选择器并解析，这里只负责把结果追加进输入框。 */
  const importKeywords = useCallback(async (target: "intercept" | "trigger") => {
    const api = consoleApi();
    if (!api?.channelsKeywordsImportTxt) {
      setNotice(t("toolConsole.unavailable"));
      return;
    }
    try {
      const result = await api.channelsKeywordsImportTxt();
      if (!result.ok) {
        // 用户取消不算失败，不打扰。
        if (!result.canceled) setNotice(result.error ?? t("toolConsole.keywordsImportFailed"));
        return;
      }
      if (target === "intercept") {
        setInterceptText((current) => mergeKeywordText(current, result.keywords));
      } else {
        setTriggerText((current) => mergeKeywordText(current, result.keywords));
      }
      setNotice(t("toolConsole.keywordsImported", { n: result.keywords.length, file: result.fileName ?? "" }));
    } catch (error) {
      console.warn("[ToolConsole] 导入关键词失败:", error);
      setNotice(t("toolConsole.keywordsImportFailed"));
    }
  }, [t]);

  const addEntry = useCallback(() => {
    if (!config) return;
    const userId = draftUserId.trim();
    if (!userId) {
      setNotice(t("toolConsole.emptyAccount"));
      return;
    }
    if (config.entries.some((entry) => entry.channel === draftChannel && entry.userId === userId)) {
      setNotice(t("toolConsole.duplicateAccount"));
      return;
    }
    const label = draftLabel.trim();
    const next: AllowlistEntry = {
      channel: draftChannel,
      userId,
      ...(label ? { label } : {}),
      addedAt: Date.now(),
      // 新增账号默认只获得群聊响应权限（私聊、工具需要手动勾）。
      permissions: { ...DEFAULT_PERMISSIONS },
    };
    setDraftUserId("");
    setDraftLabel("");
    void persist({ entries: [...config.entries, next] });
  }, [config, draftChannel, draftLabel, draftUserId, persist, t]);

  const removeEntry = useCallback((target: AllowlistEntry) => {
    if (!config) return;
    setPermissionOpenKey((current) =>
      current === `${target.channel}:${target.userId}` ? null : current,
    );
    void persist({
      entries: config.entries.filter(
        (entry) => !(entry.channel === target.channel && entry.userId === target.userId),
      ),
    });
  }, [config, persist]);

  /** 勾选 / 取消一条权限：勾 = 授权放行，取消 = 拦截。 */
  const togglePermission = useCallback((target: AllowlistEntry, key: AccessPermission, next: boolean) => {
    if (!config) return;
    void persist({
      entries: config.entries.map((entry) => {
        if (entry.channel !== target.channel || entry.userId !== target.userId) return entry;
        return { ...entry, permissions: { ...permissionsOf(entry), [key]: next } };
      }),
    });
  }, [config, persist]);

  /** 两个总开关：群员发言限制 / 工具调用拦截。 */
  const toggleGate = useCallback((key: "groupMemberGate" | "toolGate", next: boolean) => {
    void persist({ [key]: next });
  }, [persist]);

  const clearAudit = useCallback(() => {
    const api = consoleApi();
    if (!api?.channelsAuditClear) return;
    // 先把方法抓成局部 const：`api?` 的窄化不会跨进 onOk 闭包（TS2722）
    const clear = api.channelsAuditClear;
    // 走 antd 成员方法（默认弹窗边界：裸 confirm / window.confirm 被 default-dialogs-regression 禁止）
    Modal.confirm({
      title: t("toolConsole.clearConfirm"),
      okText: t("toolConsole.clear"),
      okButtonProps: { danger: true },
      cancelText: t("settingsPage.channels.cancel"),
      onOk: async () => {
        try {
          await clear();
          setAudit([]);
          setSelectedId(null);
        } catch (error) {
          console.warn("[ToolConsole] 清空失败:", error);
        }
      },
    });
  }, [t]);

  const openLog = useCallback(async (id: string, reveal: boolean) => {
    const api = consoleApi();
    const fn = reveal ? api?.channelsAuditRevealLog : api?.channelsAuditOpenLog;
    if (!fn) return;
    try {
      const result = await fn(id);
      if (!result?.ok) setNotice(result?.error || t("toolConsole.openLogFailed"));
    } catch (error) {
      console.warn("[ToolConsole] 打开日志失败:", error);
      setNotice(t("toolConsole.openLogFailed"));
    }
  }, [t]);

  const counts = useMemo(() => ({
    blocked: audit.filter((entry) => entry.status === "blocked").length,
    failed: audit.filter((entry) => entry.kind === "turn_failed").length,
    success: audit.filter((entry) => entry.kind === "turn_success").length,
  }), [audit]);

  const visibleAudit = useMemo(() => {
    if (filter === "blocked") return audit.filter((entry) => entry.status === "blocked");
    if (filter === "failed") return audit.filter((entry) => entry.kind === "turn_failed");
    if (filter === "success") return audit.filter((entry) => entry.kind === "turn_success");
    return audit;
  }, [audit, filter]);

  const selected = useMemo(
    () => audit.find((entry) => entry.id === selectedId) ?? null,
    [audit, selectedId],
  );

  const channelLabel = useCallback((channel: ConsoleChannelId) => {
    const option = CHANNEL_OPTIONS.find((item) => item.id === channel);
    return option ? t(option.labelKey) : channel;
  }, [t]);

  const statusLabel = useCallback((status: AuditStatus) => {
    if (status === "blocked") return t("toolConsole.statusBlocked");
    if (status === "failure") return t("toolConsole.statusFailure");
    return t("toolConsole.statusSuccess");
  }, [t]);

  const kindLabel = useCallback((entry: AuditEntry) => t(KIND_LABELS[entry.kind] ?? KIND_LABELS.tool_call), [t]);

  const rootClassName = auditExpanded ? "tool-console tool-console--audit-expanded" : "tool-console";
  /** 旧主进程 / 热重载时可能没有配置读写通道，没有就不渲染编辑区（避免点了没反应）。 */
  const keywordsEditable = Boolean(consoleApi()?.channelsSaveConfig);

  if (loading) {
    return <div className="tool-console tool-console--loading">{t("common.loading")}</div>;
  }

  if (!config) {
    return (
      <div className="tool-console tool-console--loading">
        {t("toolConsole.unavailable")}
      </div>
    );
  }

  if (selected) {
    return (
      <div className={rootClassName}>
        <header className="tool-console__header">
          <button type="button" className="tool-console__back" onClick={() => setSelectedId(null)}>
            ← {t("toolConsole.back")}
          </button>
          <h1 className="tool-console__title">{t("toolConsole.detailTitle")}</h1>
        </header>
        {notice && <p className="tool-console__notice">{notice}</p>}
        <div className="tool-console__detail">
          <div className="tool-console__detail-head">
            <span className={`tool-console__badge is-${selected.status}`}>{statusLabel(selected.status)}</span>
            <span className="tool-console__kind">{kindLabel(selected)}</span>
            <strong className="tool-console__detail-name">{selected.title}</strong>
          </div>
          <dl className="tool-console__detail-grid">
            <div><dt>{t("toolConsole.fieldTime")}</dt><dd>{formatTime(selected.at)}</dd></div>
            <div><dt>{t("toolConsole.fieldChannel")}</dt><dd>{channelLabel(selected.channel)} · {selected.chatType === "group" ? t("toolConsole.chatGroup") : t("toolConsole.chatPrivate")}</dd></div>
            <div><dt>{t("toolConsole.fieldSender")}</dt><dd>{selected.senderName ? `${selected.senderName} (${selected.senderId})` : selected.senderId}</dd></div>
            <div><dt>{t("toolConsole.fieldChat")}</dt><dd>{selected.chatId}</dd></div>
            {selected.trigger && (
              <div><dt>{t("toolConsole.fieldTrigger")}</dt><dd>{t(TRIGGER_LABELS[selected.trigger] ?? TRIGGER_LABELS.unknown)}</dd></div>
            )}
            {typeof selected.durationMs === "number" && (
              <div><dt>{t("toolConsole.fieldDuration")}</dt><dd>{selected.durationMs} ms</dd></div>
            )}
            {selected.toolName && (
              <div><dt>{t("toolConsole.fieldTool")}</dt><dd>{selected.toolName} <code>{selected.toolId}</code></dd></div>
            )}
            {selected.kind === "tool_call" && (
              <div><dt>{t("toolConsole.fieldAllowlisted")}</dt><dd>{selected.allowlisted === null || selected.allowlisted === undefined
                ? t("toolConsole.allowlistNotChecked")
                : selected.allowlisted ? t("toolConsole.allowlistHit") : t("toolConsole.allowlistMiss")}</dd></div>
            )}
          </dl>
          {selected.reason && (
            <p className="tool-console__detail-blocked">{t("toolConsole.detailReason")}: {selected.reason}</p>
          )}
          {selected.userText && (
            <section className="tool-console__detail-section">
              <h2>{t("toolConsole.detailUserText")}</h2>
              <pre className="tool-console__pre">{selected.userText}</pre>
            </section>
          )}
          {selected.args && Object.keys(selected.args).length > 0 && (
            <section className="tool-console__detail-section">
              <h2>{t("toolConsole.detailArgs")}</h2>
              <pre className="tool-console__pre">{JSON.stringify(selected.args, null, 2)}</pre>
            </section>
          )}
          <section className="tool-console__detail-section">
            <h2>{t("toolConsole.detailSummary")}</h2>
            <pre className="tool-console__pre">{selected.summary || t("toolConsole.emptyOutput")}</pre>
          </section>
          <section className="tool-console__detail-section">
            <h2>{t("toolConsole.detailLog")}</h2>
            <p className="tool-console__hint">{t("toolConsole.detailLogHint")}</p>
            <div className="tool-console__log-actions">
              <button type="button" className="tool-console__primary" onClick={() => void openLog(selected.id, false)}>
                {t("toolConsole.openLog")}
              </button>
              <button type="button" className="tool-console__ghost" onClick={() => void openLog(selected.id, true)}>
                {t("toolConsole.revealLog")}
              </button>
            </div>
            {selected.logPath
              ? <code className="tool-console__log-path">{selected.logPath}</code>
              : <p className="tool-console__hint">{t("toolConsole.noLogFile")}</p>}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClassName}>
      <header className="tool-console__header">
        <h1 className="tool-console__title">{t("toolConsole.title")}</h1>
        <p className="tool-console__subtitle">{t("toolConsole.subtitle")}</p>
      </header>

      <section className="tool-console__section">
        <h2 className="tool-console__section-title">{t("toolConsole.allowlistTitle")}</h2>
        <p className="tool-console__hint">{t("toolConsole.allowlistHint")}</p>
        <label className="tool-console__switch-row">
          <span>
            <strong>{t("toolConsole.gateGroupMembersTitle")}</strong>
            <span className="tool-console__hint">{t("toolConsole.gateGroupMembersDesc")}</span>
          </span>
          <input
            type="checkbox"
            checked={config.groupMemberGate}
            disabled={saving}
            onChange={(event) => toggleGate("groupMemberGate", event.target.checked)}
          />
        </label>
        <label className="tool-console__switch-row">
          <span>
            <strong>{t("toolConsole.gateToolCallsTitle")}</strong>
            <span className="tool-console__hint">{t("toolConsole.gateToolCallsDesc")}</span>
          </span>
          <input
            type="checkbox"
            checked={config.toolGate}
            disabled={saving}
            onChange={(event) => toggleGate("toolGate", event.target.checked)}
          />
        </label>
        <p className="tool-console__hint">{t("toolConsole.permissionScopeNote")}</p>
        <div className="tool-console__add">
          <select
            className="tool-console__input"
            value={draftChannel}
            onChange={(event) => setDraftChannel(event.target.value as ConsoleChannelId)}
            aria-label={t("toolConsole.fieldChannel")}
          >
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
            ))}
          </select>
          <input
            className="tool-console__input"
            value={draftUserId}
            placeholder={t("toolConsole.accountPlaceholder")}
            onChange={(event) => setDraftUserId(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") addEntry(); }}
          />
          <input
            className="tool-console__input"
            value={draftLabel}
            placeholder={t("toolConsole.labelPlaceholder")}
            onChange={(event) => setDraftLabel(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") addEntry(); }}
          />
          <button type="button" className="tool-console__primary" disabled={saving} onClick={addEntry}>
            {t("toolConsole.add")}
          </button>
        </div>
        {notice && <p className="tool-console__notice">{notice}</p>}
        <ul className="tool-console__allowlist">
          {config.entries.map((entry) => {
            const entryKey = `${entry.channel}:${entry.userId}`;
            const permissions = permissionsOf(entry);
            const granted = PERMISSION_OPTIONS.filter((option) => permissions[option.id]);
            const open = permissionOpenKey === entryKey;
            return (
              <li key={entryKey} className="tool-console__allowlist-item">
                <div className="tool-console__allowlist-main">
                  <span className="tool-console__tag">{channelLabel(entry.channel)}</span>
                  <span className="tool-console__account">{entry.userId}</span>
                  {entry.label && <span className="tool-console__label">{entry.label}</span>}
                  <span className="tool-console__grants">
                    {granted.length === 0
                      ? <span className="tool-console__grant is-empty">{t("toolConsole.noPermission")}</span>
                      : granted.map((option) => (
                          <span key={option.id} className="tool-console__grant">{t(option.labelKey)}</span>
                        ))}
                  </span>
                  <button
                    type="button"
                    className={`tool-console__permission-toggle ${open ? "is-active" : ""}`}
                    disabled={saving}
                    aria-expanded={open}
                    onClick={() => setPermissionOpenKey(open ? null : entryKey)}
                  >
                    {t("toolConsole.permissionButton")}
                  </button>
                  <button
                    type="button"
                    className="tool-console__remove"
                    disabled={saving}
                    onClick={() => removeEntry(entry)}
                    aria-label={t("toolConsole.remove")}
                  >
                    {t("toolConsole.remove")}
                  </button>
                </div>
                {open && (
                  <div className="tool-console__permission-panel">
                    <p className="tool-console__hint">{t("toolConsole.permissionHint")}</p>
                    <div className="tool-console__permission-grid">
                      {PERMISSION_OPTIONS.map((option) => (
                        <label key={option.id} className="tool-console__permission-option">
                          <input
                            type="checkbox"
                            checked={permissions[option.id]}
                            disabled={saving}
                            onChange={(event) => togglePermission(entry, option.id, event.target.checked)}
                          />
                          <span>
                            <strong>{t(option.labelKey)}</strong>
                            <span className="tool-console__hint">{t(option.descKey)}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {config.entries.length === 0 && (
            <li className="tool-console__empty">{t("toolConsole.allowlistEmpty")}</li>
          )}
        </ul>
      </section>

      {keywordsEditable && (
        <section className="tool-console__section">
          <h2 className="tool-console__section-title">{t("toolConsole.keywordsTitle")}</h2>
          <p className="tool-console__hint">{t("toolConsole.keywordsHint")}</p>

          <label className="tool-console__keyword-field">
            <span className="tool-console__keyword-label">{t("toolConsole.interceptKeywordsLabel")}</span>
            <span className="tool-console__hint">{t("toolConsole.interceptKeywordsDesc")}</span>
            <textarea
              className="tool-console__keyword-input"
              aria-label={t("toolConsole.interceptKeywordsLabel")}
              placeholder={t("toolConsole.keywordsPlaceholder")}
              rows={3}
              value={interceptText}
              onChange={(event) => setInterceptText(event.target.value)}
            />
            <span className="tool-console__keyword-actions">
              <button type="button" className="tool-console__ghost" onClick={() => void importKeywords("intercept")}>
                {t("toolConsole.keywordsImport")}
              </button>
            </span>
          </label>

          <label className="tool-console__keyword-field">
            <span className="tool-console__keyword-label">{t("toolConsole.triggerKeywordsLabel")}</span>
            <span className="tool-console__hint">{t("toolConsole.triggerKeywordsDesc")}</span>
            <textarea
              className="tool-console__keyword-input"
              aria-label={t("toolConsole.triggerKeywordsLabel")}
              placeholder={t("toolConsole.keywordsPlaceholder")}
              rows={3}
              value={triggerText}
              onChange={(event) => setTriggerText(event.target.value)}
            />
            <span className="tool-console__keyword-actions">
              <button type="button" className="tool-console__ghost" onClick={() => void importKeywords("trigger")}>
                {t("toolConsole.keywordsImport")}
              </button>
            </span>
          </label>

          <div className="tool-console__keyword-actions">
            <button
              type="button"
              className="tool-console__primary"
              disabled={keywordsSaving}
              onClick={() => void saveKeywords()}
            >
              {keywordsSaving ? t("toolConsole.keywordsSaving") : t("toolConsole.keywordsSave")}
            </button>
          </div>
        </section>
      )}

      <section className="tool-console__section tool-console__section--audit">
        <div className="tool-console__audit-head">
          <h2 className="tool-console__section-title">{t("toolConsole.auditTitle")}</h2>
          <div className="tool-console__filters">
            <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>
              {t("toolConsole.filterAll")}
            </button>
            <button type="button" className={filter === "blocked" ? "is-active" : ""} onClick={() => setFilter("blocked")}>
              {t("toolConsole.filterBlocked", { n: counts.blocked })}
            </button>
            <button type="button" className={filter === "failed" ? "is-active" : ""} onClick={() => setFilter("failed")}>
              {t("toolConsole.filterFailed", { n: counts.failed })}
            </button>
            <button type="button" className={filter === "success" ? "is-active" : ""} onClick={() => setFilter("success")}>
              {t("toolConsole.filterSuccess", { n: counts.success })}
            </button>
            <button type="button" className="tool-console__clear" onClick={() => void clearAudit()}>
              {t("toolConsole.clear")}
            </button>
            <button
              type="button"
              className="tool-console__expand"
              aria-pressed={auditExpanded}
              aria-label={auditExpanded ? t("toolConsole.auditRestore") : t("toolConsole.auditExpand")}
              title={auditExpanded ? t("toolConsole.auditRestoreHint") : t("toolConsole.auditExpandHint")}
              onClick={() => setAuditExpanded((value) => !value)}
            >
              {auditExpanded
                ? `⤡ ${t("toolConsole.auditRestore")}`
                : `⤢ ${t("toolConsole.auditExpand")}`}
            </button>
          </div>
        </div>
        <label className="tool-console__switch-row">
          <span>
            <strong>{t("toolConsole.recordSuccessTitle")}</strong>
            <span className="tool-console__hint">{t("toolConsole.recordSuccessDesc")}</span>
          </span>
          <input
            type="checkbox"
            checked={recordSuccess}
            onChange={(event) => void toggleRecordSuccess(event.target.checked)}
          />
        </label>
        <ul className="tool-console__audit">
          {visibleAudit.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="tool-console__audit-item" onClick={() => setSelectedId(entry.id)}>
                <span className={`tool-console__badge is-${entry.status}`}>{statusLabel(entry.status)}</span>
                <span className="tool-console__audit-body">
                  <span className="tool-console__audit-title">
                    <span className="tool-console__kind">{kindLabel(entry)}</span>
                    {entry.title}
                  </span>
                  <span className="tool-console__audit-meta">
                    {channelLabel(entry.channel)} · {entry.senderName ?? entry.senderId} · {formatTime(entry.at)}
                  </span>
                  <span className="tool-console__audit-summary">
                    {entry.reason || entry.summary || summarizeArgs(entry.args)}
                  </span>
                </span>
                <span className="tool-console__chevron" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
          {visibleAudit.length === 0 && (
            <li className="tool-console__empty">{t("toolConsole.auditEmpty")}</li>
          )}
        </ul>
      </section>
    </div>
  );
}

export default ToolConsolePanel;
