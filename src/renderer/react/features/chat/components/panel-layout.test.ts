import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 聊天窗口面板布局不变量（回归守卫）。
 *
 * 这里保护两类真实踩过的坑：
 *  1. 模型面板：`.model-panel__grid` 一旦参与 flex 高度分配（`flex: 1`），下方的
 *     API 配置区（自然高度上千像素）会把它压到只剩一行高度 —— 模型卡片看不见、
 *     「设为默认」点不到。正确做法是让 `.model-panel` 做唯一滚动容器，网格与
 *     API 配置都保持自然高度。
 *  2. 顶栏：用量徽章与窗口控件若是两个独立的绝对定位元素，窗口控件会盖住徽章。
 *     正确做法是同一行 flex 兄弟节点。
 */

function read(relativeFromTest: string): string {
  return readFileSync(fileURLToPath(new URL(relativeFromTest, import.meta.url)), "utf8");
}

const modelPanelCss = read("./ModelModePanel.css");
const apiConfigCss = read("./api-config/ApiConfigSection.css");
const reactRootCss = read("../../../styles/react-root.css");
const navigationSource = read("./ChatPageNavigation.tsx");

/** 抓取某个选择器的规则体。 */
function ruleBody(css: string, selector: string): string {
  const index = css.indexOf(selector);
  if (index < 0) throw new Error(`找不到选择器 ${selector}`);
  const open = css.indexOf("{", index);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("模型面板布局：模型列表与 API 配置互不挤压", () => {
  it("面板本身是滚动容器", () => {
    const body = ruleBody(modelPanelCss, ".model-panel {");
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/height:\s*100%/);
  });

  it("模型网格保持自然高度，不参与 flex 高度分配", () => {
    const body = ruleBody(modelPanelCss, ".model-panel__grid {");
    expect(body).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(body).not.toMatch(/flex:\s*1/);
    // 不允许再把网格自己变成第二个滚动区
    expect(body).not.toMatch(/overflow-y:\s*auto/);
  });

  it("API 配置区保持自然高度", () => {
    const body = ruleBody(apiConfigCss, ".api-config {");
    expect(body).toMatch(/flex:\s*0\s+0\s+auto/);
  });
});

describe("顶栏右上角：用量徽章与窗口控件并排不重叠", () => {
  it("用量徽章与窗口控件同属 .cy-page-top-right 分组", () => {
    const group = navigationSource.indexOf('className="cy-page-top-right"');
    const badge = navigationSource.indexOf("<UsageBadge");
    const controls = navigationSource.indexOf("<WindowControls");
    expect(group).toBeGreaterThan(-1);
    expect(badge).toBeGreaterThan(group);
    expect(controls).toBeGreaterThan(badge);
  });

  it("不再使用两个独立的绝对定位容器", () => {
    expect(reactRootCss).not.toContain(".cy-page-windows");
    const usageRule = ruleBody(reactRootCss, ".cy-page-usage {");
    expect(usageRule).not.toMatch(/position:\s*absolute/);
    expect(usageRule).not.toMatch(/right:/);
  });

  it("右上角分组用 flex 排布，且窗口控件尺寸固定不被压缩", () => {
    const body = ruleBody(reactRootCss, ".cy-page-top-right {");
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/right:\s*20px/);
    expect(body).toMatch(/gap:/);
    // 有最大宽度约束，避免徽章把模式切换挤出窗口
    expect(body).toMatch(/max-width:/);
  });
});
