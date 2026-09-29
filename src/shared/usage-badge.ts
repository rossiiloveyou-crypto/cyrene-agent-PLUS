// 用量徽章外观 —— 与 Chat 排版解耦的独立模块。
//
// 历史：这三项原属 src/shared/chat-appearance.ts；官方已用 message-typography 取代该模块，
// 本文件把「用量徽章」这一项单独留下（承载文件在合并中删除，故重建为独立模块）。
//
// 颜色值语义：`preset:<id>` 或 `#rrggbb`（存字符串）。

/** 默认颜色（与旧 DEFAULT_CHAT_APPEARANCE.usageBadgeColor 保持一致，勿改）。 */
export const DEFAULT_USAGE_BADGE_COLOR = "preset:peach-sunset";

/** 用量徽章的预设渐变（桃-粉-晚霞紫为默认）。 */
export const USAGE_BADGE_PRESETS: ReadonlyArray<{ id: string; label: string; image: string }> = [
  { id: "peach-sunset", label: "桃-粉-晚霞紫（默认）", image: "linear-gradient(90deg, #ffb199 0%, #ff8fb1 45%, #b18cff 100%)" },
  { id: "peach",  label: "蜜桃粉", image: "linear-gradient(90deg, #ffd3a5 0%, #ff9a9e 100%)" },
  { id: "sunset", label: "晚霞紫", image: "linear-gradient(90deg, #ff8fb1 0%, #b18cff 100%)" },
  { id: "mint",   label: "薄荷青", image: "linear-gradient(90deg, #a8edea 0%, #6fd6c4 100%)" },
  { id: "sky",    label: "海盐蓝", image: "linear-gradient(90deg, #a1c4fd 0%, #7aa8ff 100%)" },
];

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const PRESET_ID = /^preset:[a-z0-9-]{1,32}$/;

/** 归一化用量徽章颜色：只接受预设 id 或 #hex，其余回退默认。 */
export function normalizeUsageBadgeColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_USAGE_BADGE_COLOR;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_USAGE_BADGE_COLOR;
  if (PRESET_ID.test(trimmed)) return trimmed;
  if (HEX_COLOR.test(trimmed)) return trimmed.toLowerCase();
  return DEFAULT_USAGE_BADGE_COLOR;
}

/**
 * 颜色值 → 可直接用于 `background-image` 的 CSS（配合 background-clip: text 做渐变字）。
 * 自定义纯色时退化为同色双停靠渐变，保证与预设走同一条渲染路径。
 */
export function resolveUsageBadgeImage(color: string): string {
  const normalized = normalizeUsageBadgeColor(color);
  if (normalized.startsWith("preset:")) {
    const preset = USAGE_BADGE_PRESETS.find((item) => `preset:${item.id}` === normalized);
    return preset?.image ?? USAGE_BADGE_PRESETS[0].image;
  }
  return `linear-gradient(90deg, ${normalized} 0%, ${normalized} 100%)`;
}
