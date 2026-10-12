import { useCallback, useEffect, useState } from "react";
import type { NewsItem, NewsPayload } from "../../../shared/news-types";

/** 已读条目 id 按语言分别记录，切换界面语言后各看各的 */
const SEEN_KEY_PREFIX = "cyrene:news:seen:";
/** 已读记录只保留最近这些条，避免本地存储无限增长 */
const SEEN_LIMIT = 200;

function readSeenIds(locale: string): string[] {
  try {
    const raw = localStorage.getItem(`${SEEN_KEY_PREFIX}${locale}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    // 隐私模式或历史残留数据读不出来时，按"都没看过"处理
    return [];
  }
}

export interface NewsFeedState {
  loading: boolean;
  /** 拉取失败（网络不通、仓库里还没有这个文件等） */
  failed: boolean;
  /** 公告条目，无内容时为空数组 */
  items: NewsItem[];
  /** 远端内容版本，用于判断要不要通知 */
  version: string;
  /** 最近一次成功拉取的时间戳（毫秒） */
  fetchedAt: number;
  /** 未读条目的 id */
  unreadIds: string[];
  /** 未读条数，粉点提示用 */
  unreadCount: number;
  /** 打开弹窗时调用，把当前看到的条目都记为已读 */
  markRead: () => void;
}

export function useNewsFeed(locale: string): NewsFeedState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [payload, setPayload] = useState<NewsPayload | null>(null);
  const [seenIds, setSeenIds] = useState<string[]>(() => readSeenIds(locale));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    setPayload(null);
    setSeenIds(readSeenIds(locale));

    void window.news?.get(locale).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (!result || !result.ok) {
        if (result && !result.ok) console.warn("[News] 公告拉取失败:", result.error);
        setFailed(true);
        return;
      }
      setPayload({
        locale: result.locale,
        items: result.items,
        version: result.version,
        fetchedAt: result.fetchedAt,
      });
    });

    // 主进程每 6 小时对一次版本，对到新的就推过来
    const unsubscribe = window.news?.onUpdated((next) => {
      if (!alive || next.locale !== locale) return;
      setPayload(next);
      setFailed(false);
      setLoading(false);
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [locale]);

  const markRead = useCallback(() => {
    if (!payload?.items.length) return;
    const merged = [...new Set([...seenIds, ...payload.items.map((item) => item.id)])].slice(-SEEN_LIMIT);
    try {
      localStorage.setItem(`${SEEN_KEY_PREFIX}${locale}`, JSON.stringify(merged));
    } catch {
      // 写不进去也不影响本次会话：内存里的已读状态照样生效
    }
    setSeenIds(merged);
  }, [locale, payload?.items, seenIds]);

  const items = payload?.items ?? [];
  const unreadIds = items.filter((item) => !seenIds.includes(item.id)).map((item) => item.id);
  return {
    loading,
    failed,
    items,
    version: payload?.version ?? "",
    fetchedAt: payload?.fetchedAt ?? 0,
    unreadIds,
    unreadCount: unreadIds.length,
    markRead,
  };
}