/**
 * API 配置面板（聊天窗口 · 模型面板）的自包含数据层。
 *
 * 数据与设置窗口的 src/renderer/settings/api/presets.ts + custom-endpoint-state.ts 对齐，
 * 但这里**刻意不 import 设置窗口（或 shared）的任何模块**：设置面板随后会被删除，
 * 本文件是「设置 → API 设置」功能搬迁到聊天窗口后的唯一数据来源。
 *
 * 与设置窗口保持一致的不变量：
 *   - MODEL_PRESETS 的顺序 / providerName 是写入 ModelSettings.provider 的字符串，不可改写；
 *   - 自定义端点只有 cloud 变体出现在预设卡片列表里（local 靠模式按钮切换）；
 *   - resolveApiEndpoint 的追加规则必须与主进程一致，否则提示与真实请求会漂移。
 */

export type ApiTransport = "openai" | "anthropic" | "responses";

export type CustomEndpointMode = "cloud" | "local";

/** 写入 ModelSettings.provider 的自定义端点字符串常量。 */
export const CUSTOM_ENDPOINT_PROVIDERS = {
  cloud: "自定义端点（云端）",
  local: "自定义端点（本地）",
} as const;

/** 本地端点未填 API Key 时，请求侧使用的占位令牌（与设置窗口一致）。 */
export const LOCAL_ENDPOINT_AUTH_FALLBACK = "__CYRENE_LOCAL_NO_AUTH__";

/** 上下文窗口默认值 / 下限（与设置窗口的保存逻辑一致）。 */
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 256000;
export const MIN_CONTEXT_WINDOW_TOKENS = 4096;

/** 读配置失败时的兜底厂商（v1 vendor adapter 第一家落地的厂商）。 */
export const DEFAULT_PROVIDER_NAME = "MiniMax（稀宇科技）";

export interface ModelPreset {
  providerName: string;
  /** 厂商短名（去括号后缀），用于昵称默认值与档案列表副文案。 */
  shortName: string;
  baseUrl: string;
  /** 已由厂商官方确认的 Anthropic 兼容 Base URL；没有就不猜。 */
  anthropicBaseUrl?: string;
  /** 预设首次使用时选中的明确协议；用户之后可以手动修改。 */
  transport: ApiTransport;
  mainModels: string[];
  /** 相对聊天窗口文档（react/index.html）的图标路径，file:// 下同样可用。 */
  iconUrl: string;
  websiteUrl?: string;
  visionBaseUrl?: string;
  disabled?: boolean;
  defaultVisionModel?: string;
  visionModels?: string[];
  customEndpointMode?: CustomEndpointMode;
  hiddenInPresetList?: boolean;
}

/** 档案卡上需要展示/编辑的最小字段集（来自 listModelProfiles）。 */
export interface SavedProfileLite {
  id: string;
  provider: string;
  displayName?: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  explicitTransport?: ApiTransport;
  reasoning?: unknown;
  contextWindowTokens?: number;
  multimodal?: boolean;
}

/** 保存档案时提交给主进程的 payload（字段与设置窗口完全一致）。 */
export interface ModelProfilePayload {
  id?: string;
  provider: string;
  displayName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  explicitTransport: ApiTransport;
  reasoning?: unknown;
  contextWindowTokens: number;
  multimodal: boolean;
}

export interface CustomEndpointPresentation {
  displayName: string;
  apiKeyOptional: boolean;
  baseUrlPlaceholder: string;
}

export interface ResolvedApiEndpoint {
  url: string;
  /** null 表示用户已经填写完整 endpoint，程序不会再追加路径。 */
  appendedSuffix: string | null;
}

const PRESENTATION: Record<CustomEndpointMode, CustomEndpointPresentation> = {
  cloud: {
    displayName: "自定义云端",
    apiKeyOptional: false,
    baseUrlPlaceholder: "https://your-provider.example/v1",
  },
  local: {
    displayName: "本地模型",
    apiKeyOptional: true,
    baseUrlPlaceholder: "http://127.0.0.1:11434/v1",
  },
};

export const MODEL_PRESETS: ModelPreset[] = [
  // 当前已适配 9 家：MiniMax / DeepSeek / 豆包 / 智谱 GLM / Kimi / Qwen / ChatGPT / Claude / MiMo
  // 顺序按使用频率 + 适配优先级；未在此清单内的厂商已硬删，需要时再补回。
  {
    providerName: "MiniMax（稀宇科技）",
    shortName: "MiniMax",
    baseUrl: "https://api.minimaxi.com/v1",
    anthropicBaseUrl: "https://api.minimaxi.com/anthropic",
    transport: "anthropic",
    mainModels: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.5"],
    iconUrl: "../icons/providers/minimax.svg",
    websiteUrl: "https://platform.minimaxi.com/",
    // 主模型默认走 Anthropic SDK；视觉继续走 OpenAI 兼容入口。
    visionBaseUrl: "https://api.minimaxi.com/v1",
  },
  {
    // DeepSeek：v1 vendor adapter 不为它做协议层强制，仅作为 OpenAI 兼容厂商列出。
    providerName: "DeepSeek（深度求索）",
    shortName: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    anthropicBaseUrl: "https://api.deepseek.com/anthropic",
    transport: "openai",
    mainModels: ["deepseek-flash", "deepseek-v4-pro"],
    iconUrl: "../icons/providers/deepseek.svg",
    websiteUrl: "https://platform.deepseek.com/",
  },
  {
    providerName: "豆包（火山方舟）",
    shortName: "豆包",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    transport: "openai",
    mainModels: [
      "doubao-seed-2-1-pro-260628",
      "doubao-seed-2-0-pro-260215",
      "doubao-seed-2-0-lite-260428",
      "doubao-seed-2-0-mini-260428",
    ],
    iconUrl: "../icons/providers/volcengine.svg",
    websiteUrl: "https://www.volcengine.com/product/ark",
  },
  {
    providerName: "GLM（智谱）",
    shortName: "GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    anthropicBaseUrl: "https://open.bigmodel.cn/api/anthropic",
    transport: "openai",
    mainModels: ["glm-5.3", "glm-5.2", "glm-5.1", "glm-5-turbo", "glm-4.7"],
    iconUrl: "../icons/providers/glm.svg",
    websiteUrl: "https://open.bigmodel.cn/",
  },
  {
    providerName: "Kimi（月之暗面）",
    shortName: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    transport: "openai",
    mainModels: ["kimi-k2.6", "kimi-k2.5", "kimi-k2-thinking"],
    iconUrl: "../icons/providers/kimi.svg",
    websiteUrl: "https://platform.moonshot.cn/",
  },
  {
    providerName: "Qwen（通义千问）",
    shortName: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    transport: "openai",
    mainModels: ["qwen-max", "qwen-plus", "qwen-turbo"],
    iconUrl: "../icons/providers/qwen.svg",
    websiteUrl: "https://bailian.console.aliyun.com/",
  },
  {
    providerName: "ChatGPT（OpenAI）",
    shortName: "ChatGPT",
    baseUrl: "https://api.openai.com/v1",
    // 官方主推 Responses（o 系列完整思考摘要仅此协议有），新建档案默认预填 responses。
    transport: "responses",
    mainModels: ["gpt-6-astra", "gpt-5.6", "gpt-5.6-terra", "gpt-5.6-luna"],
    iconUrl: "../icons/providers/openai.svg",
    websiteUrl: "https://platform.openai.com/",
  },
  {
    providerName: "Claude（Anthropic）",
    shortName: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    transport: "anthropic",
    mainModels: ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-4-6"],
    iconUrl: "../icons/providers/claude.svg",
    websiteUrl: "https://console.anthropic.com/",
  },
  {
    providerName: "MiMo（小米）",
    shortName: "MiMo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    anthropicBaseUrl: "https://api.xiaomimimo.com/anthropic",
    transport: "openai",
    mainModels: ["mimo-v2.5-pro"],
    iconUrl: "../icons/providers/xiaomimimo.svg",
    websiteUrl: "https://mimo.mi.com/",
    visionBaseUrl: "https://api.xiaomimimo.com/v1",
    // 主模型 mimo-v2.5-pro 不适合做视觉（视觉模型是 mimo-v2.5）；
    // 仅在此预填独立视觉模型候选，用户自行决定。
    defaultVisionModel: "mimo-v2.5",
    visionModels: ["mimo-v2.5"],
  },
  {
    providerName: CUSTOM_ENDPOINT_PROVIDERS.cloud,
    shortName: "自定义",
    baseUrl: "",
    transport: "openai",
    mainModels: [],
    iconUrl: "../icons/providers/custom-endpoint.svg",
    customEndpointMode: "cloud",
  },
  {
    providerName: CUSTOM_ENDPOINT_PROVIDERS.local,
    shortName: "本地模型",
    baseUrl: "",
    transport: "openai",
    mainModels: [],
    iconUrl: "../icons/providers/custom-endpoint.svg",
    customEndpointMode: "local",
    hiddenInPresetList: true,
  },
];

/** 判定 provider 是不是自定义端点；返回 null 表示普通厂商。 */
export function getCustomEndpointMode(provider: string): CustomEndpointMode | null {
  if (provider === CUSTOM_ENDPOINT_PROVIDERS.cloud) return "cloud";
  if (provider === CUSTOM_ENDPOINT_PROVIDERS.local) return "local";
  return null;
}

export function getCustomEndpointProvider(mode: CustomEndpointMode): string {
  return CUSTOM_ENDPOINT_PROVIDERS[mode];
}

export function getCustomEndpointPresentation(mode: CustomEndpointMode): CustomEndpointPresentation {
  return PRESENTATION[mode];
}

/**
 * 按 providerName 找预设。
 * fallback：找不到匹配时回退到列表第一个可用项，而不是硬编码 MODEL_PRESETS[0]，
 * 这样未来把首项标成 disabled 也仍然合法。
 */
export function findPreset(providerName: string): ModelPreset {
  const fallback = MODEL_PRESETS.find((preset) => !preset.disabled) ?? MODEL_PRESETS[0];
  return MODEL_PRESETS.find((preset) => preset.providerName === providerName) ?? fallback;
}

/** 协议对应的默认追加后缀（端点预览的空 URL 提示用）。 */
export function defaultEndpointSuffix(transport: ApiTransport): string {
  return transport === "anthropic" ? "/v1/messages" : transport === "responses" ? "/responses" : "/chat/completions";
}

/**
 * 把 Base URL 解析成实际请求地址。
 * 必须与主进程 src/shared/api-endpoint.ts 的实现保持一致。
 */
export function resolveApiEndpoint(baseUrl: string, transport: ApiTransport): ResolvedApiEndpoint {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (transport === "anthropic") {
    if (trimmed.endsWith("/messages")) return { url: trimmed, appendedSuffix: null };
    if (trimmed.endsWith("/v1")) return { url: `${trimmed}/messages`, appendedSuffix: "/messages" };
    return { url: `${trimmed}/v1/messages`, appendedSuffix: "/v1/messages" };
  }

  if (transport === "responses") {
    // Responses API：baseUrl 已含版本前缀（如 /v1、/api/v3），只追加 /responses。
    if (trimmed.endsWith("/responses")) return { url: trimmed, appendedSuffix: null };
    return { url: `${trimmed}/responses`, appendedSuffix: "/responses" };
  }

  if (trimmed.endsWith("/chat/completions")) return { url: trimmed, appendedSuffix: null };
  return { url: `${trimmed}/chat/completions`, appendedSuffix: "/chat/completions" };
}

/**
 * 自定义端点保存/测试前的前置校验。
 * 返回 i18n key（调用方负责 t()），null 表示通过。
 */
export function validateCustomEndpointConfig(
  mode: CustomEndpointMode,
  config: { baseUrl: string; model: string; apiKey: string },
): string | null {
  const baseUrl = config.baseUrl.trim();
  if (!baseUrl) return "apiConfig.validation.needBaseUrl";

  try {
    const parsed = new URL(baseUrl);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
      return "apiConfig.validation.invalidBaseUrl";
    }
  } catch {
    return "apiConfig.validation.invalidBaseUrl";
  }

  if (!config.model.trim()) return "apiConfig.validation.needModel";
  if (mode === "cloud" && !config.apiKey.trim()) return "apiConfig.validation.needApiKey";
  return null;
}
