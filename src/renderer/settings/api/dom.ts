// 「高级设置」（api-runtime-form）与自定义端点说明的 DOM 引用。
//
// 背景：API 设置面板（预设 / 档案 / 自定义端点 / 视觉模型）已迁到聊天窗口的「模型」面板，
// 由 React 侧实现（src/renderer/react/features/chat/components/api-config/）。
// 本文件只保留设置窗口里仍然存在的两处引用：
//   - 高级设置表单里的模型请求超时字段（timeout/panel.ts 复用）
//   - 自定义端点「接入说明与 FAQ」入口按钮（mcp/panel.ts 复用）
//
// ESM 静态导入保证查询在 settings.ts 顶层代码之前执行。

/** 模型请求超时（秒）输入与重置按钮：属于「高级设置」面板 */
export const modelRequestTimeoutSecInput = document.getElementById("model-request-timeout-sec") as HTMLInputElement;
export const modelRequestTimeoutSecReset = document.getElementById("model-request-timeout-sec-reset-btn") as HTMLButtonElement;

/** 「自定义端点接入说明与 FAQ」入口：位于「高级设置」面板底部 */
export const customEndpointGuideBtn = document.getElementById("custom-endpoint-guide-btn") as HTMLButtonElement | null;
