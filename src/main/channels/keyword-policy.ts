// channels/keyword-policy —— 渠道消息的关键词策略（拦截词 / 触发词）。
//
// 拦截关键词：用户发给昔涟的文本里出现任一词块即拦截，不进入 Agent，
//   并写入「控制台」的拦截记录（含用户原文）。
// 触发关键词：白名单群里出现任一词块时，无需 @ 昔涟也会触发回复。
//   它和「@ 昔涟」一起决定一条群消息是不是在叫昔涟：
//   - 两者都没有 → 群友闲聊，直接丢弃，不写控制台拦截记录；
//   - 命中其一但群/成员不在白名单 → 未授权请求，丢弃并留痕。
//
// 纯函数模块：设置读取由调用方（dispatcher / adapter）负责，便于单测。

export interface ChannelKeywordsConfig {
  /** 命中即拦截的消息关键词 */
  intercept: string[];
  /** 群聊中无需 @ 即可触发回复的关键词 */
  trigger: string[];
}

export const DEFAULT_KEYWORDS: ChannelKeywordsConfig = { intercept: [], trigger: [] };

/** 单个关键词长度上限（防止整段文本被误粘贴成关键词） */
export const MAX_KEYWORD_LENGTH = 64;
/** 每类关键词条数上限 */
export const MAX_KEYWORDS = 500;

function normalizeList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value || value.length > MAX_KEYWORD_LENGTH) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/** 归一化关键词配置：去空行、去重（忽略大小写）、限制长度与条数。 */
export function normalizeKeywordConfig(input: unknown): ChannelKeywordsConfig {
  const source = (input ?? {}) as Partial<Record<keyof ChannelKeywordsConfig, unknown>>;
  return {
    intercept: normalizeList(source.intercept),
    trigger: normalizeList(source.trigger),
  };
}

/**
 * 解析文本导入的关键词：每行一个，兼容逗号/顿号分隔，
 * 忽略空行与以 # 开头的注释行。
 */
export function parseKeywordLines(text: string): string[] {
  return normalizeList(
    String(text ?? "")
      .split(/\r?\n/)
      .map((line) => line.split(/[,，、]/))
      .flat()
      .map((item) => item.replace(/^\s*#.*$/, ""))
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function findKeyword(text: string, keywords: readonly string[]): string | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  for (const keyword of keywords) {
    const needle = keyword.toLowerCase();
    if (needle && haystack.includes(needle)) return keyword;
  }
  return null;
}

/** 返回命中的拦截关键词；未命中返回 null。 */
export function findInterceptKeyword(text: string, keywords: readonly string[]): string | null {
  return findKeyword(text, keywords);
}

/** 返回命中的触发关键词；未命中返回 null。 */
export function findTriggerKeyword(text: string, keywords: readonly string[]): string | null {
  return findKeyword(text, keywords);
}
