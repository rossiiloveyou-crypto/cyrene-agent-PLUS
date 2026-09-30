/**
 * 渠道关键词策略的**渲染层纯逻辑**（控制台「关键词策略」区块用）。
 *
 * 从 `ToolConsolePanel` 抽出来单独成文件，理由与 `usageStatsViewModel.ts` 同：
 * 面板组件在 SSR 静态渲染下会停在 loading 分支，交互逻辑没法靠静态标记断言，
 * 于是把可纯函数化的部分搬出来直接测。
 *
 * 与主进程的契约：
 * - `dispatcher.ts` 读 `keywords.intercept`（命中即拦截，消息不进模型）；
 * - `napcat-adapter.ts` 读 `keywords.trigger`（群里命中即视作「被叫到」，无需 @）；
 * - 归一化在 `keyword-policy.ts`：去重不分大小写、单项 ≤ 64 字、每类 ≤ 500 条；
 * - 保存走 `saveChannelsSettings`，它对 keywords 做**按字段浅合并**
 *   （`intercept ?? existing`）—— 所以调用方两类都要带上，否则另一类保持原值。
 */

/** 关键词策略：两类列表，顺序即界面展示顺序。 */
export interface KeywordConfig {
  intercept: string[];
  trigger: string[];
}

/** 关键词输入框的行分隔（兼容 CRLF，主进程 `parseKeywordLines` 同语义）。 */
const LINE_BREAK = /\r?\n/;

/** 列表 → 输入框文本：一行一个词。 */
export function keywordsToText(list: readonly string[] | undefined | null): string {
  return (list ?? []).join("\n");
}

/** 输入框文本 → 列表：按行切分、去首尾空白、丢弃空行。不做去重（交给主进程归一化）。 */
export function textToKeywords(text: string): string[] {
  return text
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * 「从 txt 导入」的合并语义：**追加**到现有文本而不是覆盖。
 *
 * 去重按小写比较（与主进程一致），保留用户已输入的顺序与原文大小写；
 * 空行与重复项直接跳过。
 */
export function mergeKeywordText(current: string, incoming: readonly string[]): string {
  const merged = textToKeywords(current);
  const seen = new Set(merged.map((item) => item.toLowerCase()));
  for (const word of incoming) {
    const trimmed = word.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged.join("\n");
}

/**
 * 保存时构造的 patch。
 *
 * 两类都带上（不能只传一类，否则主进程浅合并会让另一类保持旧值 —— 这不是 bug，
 * 但界面语义上「保存」应当是所见即所得，所以显式两列都提交）。
 */
export function buildKeywordsPatch(interceptText: string, triggerText: string): { keywords: KeywordConfig } {
  return {
    keywords: {
      intercept: textToKeywords(interceptText),
      trigger: textToKeywords(triggerText),
    },
  };
}

/**
 * 保存后用主进程回传的归一化结果回填输入框。
 *
 * 主进程会做去重与截断，直接回填能避免「界面显示 501 条、磁盘只有 500 条」的错觉；
 * 回传缺失时（旧主进程）退化为本地归一化。
 */
export function resolveKeywordsAfterSave(
  saved: { keywords?: Partial<KeywordConfig> } | undefined | null,
  fallback: { interceptText: string; triggerText: string },
): { interceptText: string; triggerText: string } {
  if (saved?.keywords) {
    return {
      interceptText: keywordsToText(saved.keywords.intercept),
      triggerText: keywordsToText(saved.keywords.trigger),
    };
  }
  return {
    interceptText: keywordsToText(textToKeywords(fallback.interceptText)),
    triggerText: keywordsToText(textToKeywords(fallback.triggerText)),
  };
}
