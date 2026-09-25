// Chat 排版设置 —— Main / Preload / React 共用类型与归一化。
//
// chatLineHeight 存储无单位数字（1.75），CSS 应用时直接使用。
// usageBadgeColor 存储用量徽章文字的颜色来源：`preset:<id>` 或 `#rrggbb`。

export interface ChatAppearanceSettings {
  /** 行高，无单位数字 */
  chatLineHeight: number;
  /** 是否显示昔涟正式回复的气泡外观 */
  assistantBubbleEnabled: boolean;
  /** 聊天窗口顶栏「用量」徽章的文字颜色：preset:<id> 或 #rrggbb */
  usageBadgeColor: string;
}

export const DEFAULT_CHAT_APPEARANCE: ChatAppearanceSettings = {
  chatLineHeight: 1.75,
  assistantBubbleEnabled: false,
  usageBadgeColor: "preset:peach-sunset",
};

export const CHAT_LINE_HEIGHT_MIN = 1.0;
export const CHAT_LINE_HEIGHT_MAX = 3.0;

/** 用量徽章的预设渐变（桃-粉-晚霞紫为默认）。 */
export const USAGE_BADGE_PRESETS: ReadonlyArray<{ id: string; label: string; image: string }> = [
  {
    id: "peach-sunset",
    label: "桃-粉-晚霞紫（默认）",
    image: "linear-gradient(90deg, #ffb199 0%, #ff8fb1 45%, #b18cff 100%)",
  },
  { id: "peach", label: "蜜桃粉", image: "linear-gradient(90deg, #ffd3a5 0%, #ff9a9e 100%)" },
  { id: "sunset", label: "晚霞紫", image: "linear-gradient(90deg, #ff8fb1 0%, #b18cff 100%)" },
  { id: "mint", label: "薄荷青", image: "linear-gradient(90deg, #a8edea 0%, #6fd6c4 100%)" },
  { id: "sky", label: "海盐蓝", image: "linear-gradient(90deg, #a1c4fd 0%, #7aa8ff 100%)" },
];

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const PRESET_ID = /^preset:[a-z0-9-]{1,32}$/;

/** 归一化用量徽章颜色：只接受预设 id 或 #hex，其余回退默认。 */
export function normalizeUsageBadgeColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CHAT_APPEARANCE.usageBadgeColor;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_CHAT_APPEARANCE.usageBadgeColor;
  if (PRESET_ID.test(trimmed)) return trimmed;
  if (HEX_COLOR.test(trimmed)) return trimmed.toLowerCase();
  return DEFAULT_CHAT_APPEARANCE.usageBadgeColor;
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

/**
 * 将有限数值 clamp 到 [min, max]；非有限值（NaN / Infinity / 非 number）回退默认值。
 */
export function clampFiniteNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * 从任意输入归一化为合法 ChatAppearanceSettings。
 * 输入可以是完整对象、部分对象、null、undefined 或其他任意值。
 */
export function normalizeChatAppearance(
  input: unknown,
): ChatAppearanceSettings {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  return {
    chatLineHeight: clampFiniteNumber(
      source.chatLineHeight,
      CHAT_LINE_HEIGHT_MIN,
      CHAT_LINE_HEIGHT_MAX,
      DEFAULT_CHAT_APPEARANCE.chatLineHeight,
    ),
    assistantBubbleEnabled:
      typeof source.assistantBubbleEnabled === "boolean"
        ? source.assistantBubbleEnabled
        : DEFAULT_CHAT_APPEARANCE.assistantBubbleEnabled,
    usageBadgeColor: normalizeUsageBadgeColor(source.usageBadgeColor),
  };
}
