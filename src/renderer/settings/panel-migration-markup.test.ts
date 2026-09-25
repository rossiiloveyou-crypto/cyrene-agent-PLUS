import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("./index.html", import.meta.url)), "utf8");

/** 取某个面板的 HTML 片段（按同名标签深度配平，面板内可以嵌套同名子面板）。 */
function panelSlice(id: string): string {
  const idIndex = html.indexOf(`id="${id}"`);
  if (idIndex < 0) throw new Error(`找不到面板 ${id}`);
  const openIndex = html.lastIndexOf("<", idIndex);
  const tag = html.slice(openIndex, idIndex).startsWith("<form") ? "form" : "section";
  const openTagEnd = html.indexOf(">", idIndex) + 1;
  const pattern = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  pattern.lastIndex = openTagEnd;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[0] === `</${tag}>`) {
      depth -= 1;
      if (depth === 0) return html.slice(openIndex, match.index);
    } else {
      depth += 1;
    }
  }
  throw new Error(`面板 ${id} 未闭合`);
}

describe("设置窗口面板整合（导航精简 + 面板搬迁）", () => {
  it("侧边栏不再有 昔涟设置 / TTS / ASR / Token 用量 入口", () => {
    for (const section of ["cyrene", "tts", "asr", "tokens"]) {
      expect(html).not.toContain(`data-section="${section}"`);
    }
  });

  it("昔涟设置面板与 Token 用量面板已整体移除", () => {
    expect(html).not.toContain('id="cyrene-panel"');
    expect(html).not.toContain('id="token-panel"');
    expect(html).not.toContain('id="cyrene-save-status"');
  });

  it("状态栏实时更新 / 表情包发送 已在外观设置的个性化里", () => {
    const appearance = panelSlice("appearance-form");
    expect(appearance).toContain('id="runtime-sync"');
    expect(appearance).toContain('id="sticker-enabled"');
    expect(appearance).toContain('id="sticker-size"');
    expect(appearance).toContain('id="sticker-threshold"');
    // 个性化区块（用量文字颜色）也在同一面板
    expect(appearance).toContain('id="usage-badge-color-select"');
    expect(appearance).toContain('id="usage-badge-color-custom"');
  });

  it("RAG / 文档导入 已在记忆面板里", () => {
    const memory = panelSlice("memory-panel");
    expect(memory).toContain('id="embedding-mirror"');
    expect(memory).toContain('id="embedding-dimensions-input"');
    expect(memory).toContain('id="reranker-standard-status"');
  });

  it("TTS / ASR 面板挂在工具配置面板内部，且不再是被隐藏的独立面板", () => {
    const plugins = panelSlice("plugins-panel");
    expect(plugins).toContain('id="tts-panel"');
    expect(plugins).toContain('id="asr-panel"');
    // 顺序：TTS 在 ASR 之前
    expect(plugins.indexOf('id="tts-panel"')).toBeLessThan(plugins.indexOf('id="asr-panel"'));
    // 迁入后是子面板，不再带 settings-panel / is-hidden（否则进不去、也不会被切到）
    expect(html).toContain('<section class="settings-subpanel" id="tts-panel">');
    expect(html).toContain('<section class="settings-subpanel" id="asr-panel">');
    expect(html).not.toContain('class="settings-panel is-hidden" id="tts-panel"');
    expect(html).not.toContain('class="settings-panel is-hidden" id="asr-panel"');
  });

  it("设置页顶层只剩面板，没有任何游离在面板之外的残留区块", () => {
    // 「Token 用量」面板删除后，它的图表标记曾遗留在 .settings-content 下，
    // 导致每个标签页底部都会出现「每日消耗柱状图」等已弃用内容。
    for (const dead of ["token-charts", "token-empty", "token-tooltip", "token-bar-chart", "token-trend-chart", "token-model-chart"]) {
      expect(html, `残留的 Token 用量标记: ${dead}`).not.toContain(dead);
    }
    expect(html).not.toContain("panel.tokens.");
  });

  it("子面板带有尺寸约束样式，不会被父级 flex/grid 压扁", () => {
    // `.settings-subpanel` 曾完全没有 CSS 规则：TTS/ASR 面板作为 #plugins-panel
    // 的可伸缩子节点，在窄窗口/缩放下会被压扁，标题块被下方内容盖住。
    const css = readFileSync(fileURLToPath(new URL("./settings.css", import.meta.url)), "utf8");
    const index = css.indexOf(".settings-subpanel {");
    expect(index, "settings.css 缺少 .settings-subpanel 规则").toBeGreaterThan(-1);
    const body = css.slice(css.indexOf("{", index) + 1, css.indexOf("}", index));
    expect(body).toMatch(/flex-shrink:\s*0/);
    expect(body).toMatch(/min-width:\s*0/);
    const headingIndex = css.indexOf(".settings-subpanel .panel-heading {");
    expect(headingIndex, "settings.css 缺少子面板标题块的收缩保护").toBeGreaterThan(-1);
    const headingBody = css.slice(css.indexOf("{", headingIndex) + 1, css.indexOf("}", headingIndex));
    expect(headingBody).toMatch(/flex-shrink:\s*0/);
  });

  it("外观设置仍是表单，保证迁入的开关仍然受表单语义约束", () => {
    expect(html).toContain('<form class="settings-panel is-hidden" id="appearance-form" data-panel="appearance">');
  });
});
