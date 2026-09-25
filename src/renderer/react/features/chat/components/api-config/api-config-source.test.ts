import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// API 设置面板已从设置窗口迁到聊天窗口「模型」面板（React 实现）。
// 这里按源码内容验证迁移后仍然成立的行为契约；曾位于
// src/renderer/settings/custom-endpoint-markup.test.ts。

const componentSource = fs.readFileSync(
  fileURLToPath(new URL("./ApiConfigSection.tsx", import.meta.url)),
  "utf8",
);
const presetsSource = fs.readFileSync(fileURLToPath(new URL("./presets.ts", import.meta.url)), "utf8");
const cssSource = fs.readFileSync(fileURLToPath(new URL("./ApiConfigSection.css", import.meta.url)), "utf8");
const settingsHtml = fs.readFileSync(
  fileURLToPath(new URL("../../../../../settings/index.html", import.meta.url)),
  "utf8",
);
const mcpSource = fs.readFileSync(
  fileURLToPath(new URL("../../../../../settings/mcp/panel.ts", import.meta.url)),
  "utf8",
);

describe("custom endpoint API settings UI（已迁至聊天窗口模型面板）", () => {
  it("设置窗口不再包含 API 面板，也没有 API 设置入口", () => {
    expect(settingsHtml).not.toContain('id="api-form"');
    expect(settingsHtml).not.toContain('data-section="api"');
    expect(settingsHtml).not.toContain('id="custom-endpoint-controls"');
    // 「高级设置」仍然保留，且自定义端点说明入口移到了这里
    expect(settingsHtml).toContain('id="api-runtime-form"');
    expect(settingsHtml).toContain('id="custom-endpoint-guide-btn"');
  });

  it("React 面板包含云端/本地端点控制与动态字段文案", () => {
    expect(componentSource).toContain("api-config__mode-btn");
    expect(componentSource).toContain("apiConfig.customEndpoint.modeCloud");
    expect(componentSource).toContain("apiConfig.customEndpoint.modeLocal");
    // 协议三选一：不提供 "auto"（不做协议自动探测）
    expect(componentSource).not.toContain('"auto"');
    // 动态标签 / 提示 / 端点预览走 i18n
    expect(componentSource).toContain("apiConfig.apiKey.label");
    expect(componentSource).toContain("apiConfig.transport.hint");
    expect(componentSource).toContain("apiConfig.endpointPreview.");
  });

  it("档案通过模型目录持久化，没有 perProvider 缓存", () => {
    expect(componentSource).toContain("saveModelProfile");
    expect(componentSource).toContain("listModelProfiles");
    expect(componentSource).toContain("deleteModelProfile");
    expect(componentSource).not.toContain("providerProfileCache");
    expect(componentSource).not.toContain("captureActiveProviderProfile");
    // 视觉模型 / 思考覆盖 / maxToken 属于全局项，保存档案时随 saveConfig 一起落盘
    expect(componentSource).toContain("saveConfig");
    expect(componentSource).toContain("thinkingOverride");
    expect(componentSource).toContain("disableMaxToken");
  });

  it("保留已确认的 Anthropic 兼容预设地址", () => {
    expect(presetsSource).toContain('anthropicBaseUrl: "https://api.minimaxi.com/anthropic"');
    expect(presetsSource).toContain('anthropicBaseUrl: "https://api.deepseek.com/anthropic"');
    expect(presetsSource).toContain('anthropicBaseUrl: "https://open.bigmodel.cn/api/anthropic"');
    expect(presetsSource).toContain('anthropicBaseUrl: "https://api.xiaomimimo.com/anthropic"');
  });

  it("自定义端点的本地模式列表项默认隐藏，但配置仍在数据层", () => {
    expect(presetsSource).toContain("hiddenInPresetList: true");
    expect(presetsSource).toContain("CUSTOM_ENDPOINT_PROVIDERS");
  });

  it("接入说明与 FAQ 的文案仍在设置窗口的 MCP 面板里（入口按钮已随迁移挪到高级设置）", () => {
    expect(mcpSource).toContain("本地模型与自定义端点不在官方技术支持范围内");
    expect(mcpSource).toContain("本地模型回复格式异常");
    expect(mcpSource).toContain("MiniMax 思考模式失效");
    expect(mcpSource).toContain("Claude 配置项比其他厂商少");
  });

  it("面板样式自带作用域，不依赖设置窗口的 .field 规则", () => {
    expect(cssSource).toContain(".api-config");
    expect(componentSource).toContain('import "./ApiConfigSection.css"');
  });
});
