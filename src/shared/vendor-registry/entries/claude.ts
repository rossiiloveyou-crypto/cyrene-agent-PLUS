// claude（Anthropic）的注册表条目 —— 推理规则自 shared/reasoning.ts、能力自 capabilities.ts 原样迁入。
import { defineVendor, legacyMetadata } from "../define-vendor";

export const CLAUDE_REGISTRY = defineVendor({
  capability: {
    id: "claude",
    displayName: "Claude（Anthropic）",
    transport: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    authStyle: "x-api-key",
    defaultModel: "claude-sonnet-4-6",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "thinking",
    cacheStrategy: "cache_control",
    testStrategy: "text",
    // 自家协议 only
    supportedTransports: ["anthropic"],
  },
  presetDefaults: {
    baseUrl: "https://api.anthropic.com/v1",
    transport: "anthropic",
  },
  models: [
    {
      model: "claude-fable-5",
      recommendedFor: ["chat"],
      unknownCapabilities: [
        { feature: "sampling", transport: "anthropic", note: "现有采样白名单未覆盖该型号。" },
      ],
    },
    {
      model: "claude-opus-4-8",
      recommendedFor: ["chat"],
      unknownCapabilities: [
        { feature: "sampling", transport: "anthropic", note: "现有采样白名单未覆盖该型号。" },
      ],
    },
    {
      model: "claude-sonnet-4-6",
      recommendedFor: ["chat"],
      unknownCapabilities: [
        { feature: "sampling", transport: "anthropic", note: "现有采样白名单未覆盖该型号。" },
      ],
    },
    {
      model: "claude-opus-4-7",
      recommendedFor: [],
      note: "历史清单保留名称；不改写用户请求。",
    },
    {
      model: "claude-opus-4-6",
      recommendedFor: [],
      note: "历史清单保留名称；不改写用户请求。",
    },
    {
      model: "claude-sonnet-5",
      recommendedFor: [],
      note: "历史清单保留名称；不改写用户请求。",
    },
  ],
  shortName: "Claude",
  structuredOutputRules: [
    {
      id: "claude-structured-output",

      transport: "anthropic",
      modelPattern: /^claude-(?:fable-5|mythos(?:-5|-preview)|opus-4-[5-8]|sonnet-(?:5|4-[56])|haiku-4-5)(?:$|-\d{8})/i,
      tier: "A",
      mode: "provider_json_schema",
      verification: "official",
      metadata: legacyMetadata("迁自 src/main/orchestrator/structured-output/profiles.ts"),
    },
  ],
  reasoningRules: [
    // ── claude（Anthropic）──
    { modelPattern: /^claude-fable-5/i, modelInferencePattern: /^claude-fable-5/i, metadata: legacyMetadata("迁自 src/shared/vendor-registry/entries/claude.ts"), capability: {
      control: "toggle-effort",
      supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      requestStyle: "anthropic-adaptive",
      supportsDisable: true,
    } },
    { modelPattern: /^claude-sonnet-5/i, modelInferencePattern: /^claude-sonnet-5/i, metadata: legacyMetadata("迁自 src/shared/vendor-registry/entries/claude.ts"), capability: {
      control: "toggle-effort",
      supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      requestStyle: "anthropic-adaptive",
      supportsDisable: true,
    } },
    { modelPattern: /^claude-opus-4-(8|7|6)/i, modelInferencePattern: /^claude-opus-4-(8|7|6)/i, metadata: legacyMetadata("迁自 src/shared/vendor-registry/entries/claude.ts"), capability: {
      control: "toggle-effort",
      supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      requestStyle: "anthropic-adaptive",
      supportsDisable: true,
    } },
    { modelPattern: /^claude-sonnet-4-6/i, modelInferencePattern: /^claude-sonnet-4-6/i, metadata: legacyMetadata("迁自 src/shared/vendor-registry/entries/claude.ts"), capability: {
      control: "toggle-effort",
      supportedEfforts: ["low", "medium", "high", "xhigh"],
      defaultEffort: "high",
      requestStyle: "anthropic-adaptive",
      supportsDisable: true,
    } },
  ],
});
