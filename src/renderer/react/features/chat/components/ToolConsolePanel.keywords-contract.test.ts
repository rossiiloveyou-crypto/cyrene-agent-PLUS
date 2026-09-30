/**
 * 控制台「关键词策略」接线契约测试。
 *
 * 为什么需要它：关键词策略的后端（`dispatcher` / `napcat-adapter` / `keyword-policy`）
 * 一直是完好的，缺的只是**界面入口** —— 而「入口缺失」恰好是 tsc 与全量测试都抓不到的一类
 * 缺陷（2026-09-30 的实证：React 设置页里一个 UI 都没有，代码却全绿）。
 *
 * 本测试锁三件事：
 * 1. 面板确实通过既有 IPC 通道读写关键词（不是自己另起一套）；
 * 2. 面板引用的每个 `toolConsole.*` 键在 zh-CN 与 en 里都存在（防运行时显示成 key 名）；
 * 3. 编辑区有「没有通道就不渲染」的守卫（旧主进程 / 热重载时不出现点了没反应的按钮）。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readFromHere = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const panelSource = readFromHere("./ToolConsolePanel.tsx");
const zhCN = JSON.parse(readFromHere("../../../i18n/zh-CN.json")) as Record<string, Record<string, string>>;
const en = JSON.parse(readFromHere("../../../i18n/en.json")) as Record<string, Record<string, string>>;

describe("控制台关键词策略接线", () => {
  it("通过既有 channels 通道读写，而不是自建 IPC", () => {
    // 读：初始化时从 channelsGetConfig 取 keywords
    expect(panelSource).toContain("channelsGetConfig");
    expect(panelSource).toContain("settings?.keywords?.intercept");
    expect(panelSource).toContain("settings?.keywords?.trigger");
    // 写：保存必须走 channelsSaveConfig（主进程该通道内部会 reloadDispatcherSettings）
    expect(panelSource).toContain("channelsSaveConfig");
    expect(panelSource).toContain("buildKeywordsPatch");
    // 导入复用既有 txt 通道
    expect(panelSource).toContain("channelsKeywordsImportTxt");
  });

  it("纯逻辑集中在 channel-keywords 模块（可单测，不在组件里重复实现）", () => {
    expect(panelSource).toContain('from "./channel-keywords"');
    // 组件自己不应再实现一遍文本切分逻辑
    expect(panelSource).not.toMatch(/split\(\/\\r\?\\n\//);
  });

  it("编辑区有 API 守卫，没通道时不渲染", () => {
    expect(panelSource).toContain("keywordsEditable");
    expect(panelSource).toMatch(/\{keywordsEditable && \(/);
  });

  it("面板引用的 toolConsole.* 键在 zh-CN 与 en 中都存在", () => {
    const used = [...panelSource.matchAll(/t\("(toolConsole\.[A-Za-z0-9_]+)"/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(30);
    const missingZh = [...new Set(used)].filter((key) => !zhCN.toolConsole?.[key.slice("toolConsole.".length)]);
    const missingEn = [...new Set(used)].filter((key) => !en.toolConsole?.[key.slice("toolConsole.".length)]);
    expect(missingZh, "zh-CN 缺失的键").toEqual([]);
    expect(missingEn, "en 缺失的键").toEqual([]);
  });

  it("关键词区块的两个输入框与保存按钮都在（渲染标记齐）", () => {
    for (const marker of [
      "toolConsole.keywordsTitle",
      "toolConsole.interceptKeywordsLabel",
      "toolConsole.triggerKeywordsLabel",
      "toolConsole.keywordsSave",
      "toolConsole.keywordsImport",
    ]) {
      expect(panelSource).toContain(marker);
      expect(Object.keys(zhCN.toolConsole)).toContain(marker.slice("toolConsole.".length));
      expect(Object.keys(en.toolConsole)).toContain(marker.slice("toolConsole.".length));
    }
    // 两个 textarea（拦截 / 触发）
    expect([...panelSource.matchAll(/className="tool-console__keyword-input"/g)].length).toBe(2);
  });
});
