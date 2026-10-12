import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import type { MarketPluginDetails, MarketPluginEntry, PluginManagementApi } from "../../../shared/plugin-management";
import { FeedbackProvider } from "./feedback/FeedbackProvider";
import { PluginModePanel } from "../features/chat/components/PluginModePanel";

const plugin: MarketPluginEntry = {
  id: "chat-export",
  name: "聊天记录导出",
  version: "1.0.0",
  description: "把本地聊天存档导出为人可读的 HTML / Markdown 文件：还原聊天气泡界面、双方头像、思考过程与工具调用折叠展示。",
  author: "Playa",
  downloads: 0,
  homepage: "https://github.com/Playa-Cyrene/Cyrene-Plugins/tree/main/plugins/chat-export",
};

const details: MarketPluginDetails = {
  schemaVersion: 1,
  features: [
    "按标题搜索会话，支持全选和跨搜索结果多选",
    "导出为独立 HTML（网页文件），还原聊天气泡、头像、思考过程和工具调用",
    "导出为 Markdown（轻量标记文本），便于二次编辑和归档",
    "还原时间、图片附件、表情包标注和微信、飞书、QQ 等渠道来源",
  ],
  requirements: ["需要支持插件的 Cyrene 版本", "首次使用时选择导出目录"],
  setup: [
    "在 Cyrene 插件市场安装并启用插件",
    "打开插件，在会话列表中搜索并勾选要导出的会话",
    "选择 HTML 或 Markdown 格式，点击导出并选择保存目录",
  ],
  dataHandling: [
    "只读本机聊天存档，不会修改或上传聊天内容",
    "插件不联网，也不收集遥测数据",
    "HTML 导出会将图片附件以内嵌形式保存；图片较多时文件会更大",
  ],
  documentationUrl: plugin.homepage,
};

const api: PluginManagementApi = {
  list: async () => ({ plugins: [], issues: [] }),
  setEnabled: async () => ({ ok: true }),
  open: async () => ({ ok: true }),
  rescan: async () => ({ plugins: [], issues: [] }),
  importZip: async () => ({ ok: false, canceled: true }),
  uninstall: async () => ({ ok: true }),
  marketList: async () => ({
    ok: true,
    plugins: [plugin],
    sources: [{ url: "https://raw.githubusercontent.com/Playa-0v0/Cyrene-Plugins/main/registry.json", ok: true, used: true }],
  }),
  marketDetails: async (): Promise<{ ok: true; details: MarketPluginDetails }> => ({ ok: true, details }),
  marketInstall: async () => ({ ok: true, plugin: { id: plugin.id, name: plugin.name, version: plugin.version } }),
};

const root = document.getElementById("preview-root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ConfigProvider>
        <FeedbackProvider><PluginModePanel api={api} /></FeedbackProvider>
      </ConfigProvider>
    </React.StrictMode>,
  );
}
