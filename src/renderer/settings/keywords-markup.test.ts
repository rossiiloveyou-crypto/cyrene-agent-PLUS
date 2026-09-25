import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("./index.html", import.meta.url)), "utf8");
const zhCN = JSON.parse(
  readFileSync(fileURLToPath(new URL("./i18n/zh-CN.json", import.meta.url)), "utf8"),
) as Record<string, unknown>;

function posOf(marker: string): number {
  const index = html.indexOf(marker);
  if (index < 0) throw new Error(`markup 缺少锚点: ${marker}`);
  return index;
}

function lookup(key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (!node || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[part];
  }, zhCN);
}

describe("偏好设置：拦截关键词 / 触发关键词面板", () => {
  it("两个关键词编辑区的稳定 id 都存在", () => {
    for (const id of [
      "intercept-keywords",
      "intercept-keywords-import",
      "intercept-keywords-clear",
      "intercept-keywords-status",
      "trigger-keywords",
      "trigger-keywords-import",
      "trigger-keywords-status",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("顺序为：拦截关键词行 < 触发关键词行（都在偏好设置里）", () => {
    expect(posOf('id="preferences-form"')).toBeLessThan(posOf('id="intercept-keywords-row"'));
    expect(posOf('id="intercept-keywords-row"')).toBeLessThan(posOf('id="trigger-keywords-row"'));
  });

  it("清空拦截词只有一个按钮（二级确认在脚本里做，不额外弹窗）", () => {
    expect(html).toContain('data-i18n="panel.preferences.keywords.clear">一键清空</span>');
    expect(html.match(/id="intercept-keywords-clear"/g)).toHaveLength(1);
  });

  it("两行文案都能在 zh-CN 资源里找到（settings 窗口用 settings.* 前缀）", () => {
    for (const key of [
      "settings.panel.preferences.keywords.interceptTitle",
      "settings.panel.preferences.keywords.interceptDesc",
      "settings.panel.preferences.keywords.triggerTitle",
      "settings.panel.preferences.keywords.triggerDesc",
      "settings.panel.preferences.keywords.importTxt",
      "settings.panel.preferences.keywords.clear",
      "settings.panel.preferences.keywords.clearArmed",
      "settings.panel.preferences.keywords.cleared",
      "settings.panel.preferences.keywords.imported",
      "settings.panel.preferences.keywords.importFailed",
      "settings.panel.preferences.keywords.saveFailed",
    ]) {
      expect(typeof lookup(key)).toBe("string");
    }
  });

  it("触发关键词说明写清了「白名单群里免 @」的语义", () => {
    const desc = lookup("settings.panel.preferences.keywords.triggerDesc") as string;
    expect(desc).toContain("白名单群");
    expect(desc).toContain("@");
  });
});
