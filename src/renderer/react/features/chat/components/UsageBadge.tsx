import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../../i18n";
import "./UsageBadge.css";

/** 与主进程 conversation-usage-store 对齐的会话用量快照 */
interface SessionUsageSnapshot {
  sessionId: string;
  input: number;
  output: number;
  cachedInput: number;
  cacheCreation: number;
  requests: number;
  updatedAt: number;
  totalTokens: number;
  cacheHitRate: number | null;
  hasCacheData: boolean;
}

interface TokenUsageDay {
  date: string;
  weekday: string;
  input: number;
  output: number;
  hit: number;
  miss: number;
  cacheCreation: number;
  requests: number;
  attemptedRequests: number;
}

interface TokenUsageReport {
  days: TokenUsageDay[];
  models: Array<{
    model: string;
    input: number;
    output: number;
    hit: number;
    miss: number;
    cacheCreation: number;
    requests: number;
  }>;
}

interface TokenUsageApi {
  get?: (days: number) => Promise<TokenUsageReport>;
  getSession?: (sessionId: string) => Promise<SessionUsageSnapshot>;
  onSessionUsage?: (callback: (snapshot: SessionUsageSnapshot) => void) => () => void;
}

/** 全局汇总的统计窗口（天） */
const GLOBAL_WINDOW_DAYS = 30;
/** 模型占比列表最多显示几条 */
const MODEL_ROWS = 5;

function usageApi(): TokenUsageApi | undefined {
  return (window as typeof window & { tokenUsage?: TokenUsageApi }).tokenUsage;
}

/** 155M / 1.5M / 12.3K —— 千分位以下直接显示原值 */
export function formatTokenCount(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 10_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 命中率 → 95% / -- */
export function formatHitRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "--";
  return `${Math.round(Math.min(1, Math.max(0, rate)) * 100)}%`;
}

function sumDays(days: TokenUsageDay[]) {
  const total = days.reduce(
    (acc, day) => ({
      input: acc.input + (day.input || 0),
      output: acc.output + (day.output || 0),
      hit: acc.hit + (day.hit || 0),
      miss: acc.miss + (day.miss || 0),
      cacheCreation: acc.cacheCreation + (day.cacheCreation || 0),
      requests: acc.requests + (day.requests || 0),
      attemptedRequests: acc.attemptedRequests + (day.attemptedRequests || 0),
    }),
    { input: 0, output: 0, hit: 0, miss: 0, cacheCreation: 0, requests: 0, attemptedRequests: 0 },
  );
  const cacheTotal = total.hit + total.miss;
  return {
    ...total,
    totalTokens: total.input + total.output,
    hitRate: cacheTotal > 0 ? total.hit / cacheTotal : null,
  };
}

interface UsageBadgeProps {
  /** 当前对话（会话）id；为空时不显示徽章 */
  sessionId?: string;
}

/**
 * 聊天窗口顶栏「用量」徽章。
 *
 * - 默认实时显示**本对话**的累计用量与缓存命中率（155M/95%）；
 * - 点击展开：本对话明细 + 近 30 天全局汇总与模型占比；
 * - 文字颜色来自外观设置-个性化（默认桃-粉-晚霞紫渐变）。
 */
export function UsageBadge({ sessionId }: UsageBadgeProps) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<SessionUsageSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<TokenUsageReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 本对话用量：先订阅再拉取，避免漏掉拉取期间的变化
  useEffect(() => {
    setUsage(null);
    if (!sessionId) return;
    const api = usageApi();
    if (!api?.getSession) return;
    let disposed = false;
    const off = api.onSessionUsage?.((snapshot) => {
      if (disposed || !snapshot || snapshot.sessionId !== sessionId) return;
      setUsage(snapshot);
    });
    void api.getSession(sessionId)
      .then((snapshot) => {
        if (!disposed && snapshot) setUsage(snapshot);
      })
      .catch((error) => console.warn("[UsageBadge] 读取对话用量失败:", error));
    return () => {
      disposed = true;
      off?.();
    };
  }, [sessionId]);

  // 展开时才拉全局汇总
  useEffect(() => {
    if (!open || report || loadingReport) return;
    const api = usageApi();
    if (!api?.get) return;
    setLoadingReport(true);
    void api.get(GLOBAL_WINDOW_DAYS)
      .then((value) => setReport(value))
      .catch((error) => console.warn("[UsageBadge] 读取全局用量失败:", error))
      .finally(() => setLoadingReport(false));
  }, [open, report, loadingReport]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const global = useMemo(() => (report ? sumDays(report.days ?? []) : null), [report]);
  const topModels = useMemo(() => {
    if (!report?.models?.length) return [];
    return [...report.models]
      .sort((a, b) => (b.input + b.output) - (a.input + a.output))
      .slice(0, MODEL_ROWS);
  }, [report]);

  const toggle = useCallback(() => setOpen((current) => !current), []);

  if (!sessionId) return null;

  const total = usage?.totalTokens ?? 0;
  const rate = usage?.hasCacheData ? usage.cacheHitRate : null;

  return (
    <div className="cy-usage" ref={rootRef}>
      <button
        type="button"
        className={"cy-usage__badge" + (open ? " is-open" : "")}
        onClick={toggle}
        title={t("usageBadge.tip")}
        aria-expanded={open}
      >
        <span className="cy-usage__label">{t("usageBadge.label")}</span>
        <span className="cy-usage__value">
          {formatTokenCount(total)}
          <span className="cy-usage__sep">/</span>
          {formatHitRate(rate)}
        </span>
      </button>

      {open && (
        <div className="cy-usage__menu" role="dialog" aria-label={t("usageBadge.detailTitle")}>
          <div className="cy-usage__menu-head">
            <strong>{t("usageBadge.conversation")}</strong>
            <span>{t("usageBadge.conversationHint")}</span>
          </div>
          <dl className="cy-usage__rows">
            <div><dt>{t("usageBadge.total")}</dt><dd>{formatTokenCount(total)}</dd></div>
            <div><dt>{t("usageBadge.input")}</dt><dd>{formatTokenCount(usage?.input ?? 0)}</dd></div>
            <div><dt>{t("usageBadge.output")}</dt><dd>{formatTokenCount(usage?.output ?? 0)}</dd></div>
            <div><dt>{t("usageBadge.cacheHit")}</dt><dd>{formatTokenCount(usage?.cachedInput ?? 0)}</dd></div>
            <div><dt>{t("usageBadge.hitRate")}</dt><dd>{formatHitRate(rate)}</dd></div>
            <div><dt>{t("usageBadge.requests")}</dt><dd>{(usage?.requests ?? 0).toLocaleString()}</dd></div>
          </dl>

          <div className="cy-usage__menu-head cy-usage__menu-head--global">
            <strong>{t("usageBadge.global", { days: GLOBAL_WINDOW_DAYS })}</strong>
            <span>{t("usageBadge.globalHint")}</span>
          </div>
          {loadingReport && !global ? (
            <p className="cy-usage__empty">{t("common.loading")}</p>
          ) : global ? (
            <>
              <dl className="cy-usage__rows">
                <div><dt>{t("usageBadge.total")}</dt><dd>{formatTokenCount(global.totalTokens)}</dd></div>
                <div><dt>{t("usageBadge.input")}</dt><dd>{formatTokenCount(global.input)}</dd></div>
                <div><dt>{t("usageBadge.output")}</dt><dd>{formatTokenCount(global.output)}</dd></div>
                <div><dt>{t("usageBadge.hitRate")}</dt><dd>{formatHitRate(global.hitRate)}</dd></div>
                <div><dt>{t("usageBadge.requests")}</dt><dd>{global.requests.toLocaleString()}</dd></div>
              </dl>
              {topModels.length > 0 && (
                <ul className="cy-usage__models">
                  {topModels.map((model) => (
                    <li key={model.model}>
                      <span className="cy-usage__model-name">{model.model}</span>
                      <span className="cy-usage__model-value">{formatTokenCount(model.input + model.output)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="cy-usage__empty">{t("usageBadge.noData")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default UsageBadge;
