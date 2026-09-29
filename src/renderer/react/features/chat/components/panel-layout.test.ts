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

/**
 * 🔴 P5 修订：`./ModelModePanel.css` 与 `./api-config/ApiConfigSection.css` 的读取
 * **从模块顶层移进各自的 describe**。
 *
 * 原因：`ModelModePanel.{tsx,css,test}` 已被 P4 删除（官方树也没有）。原先在顶层
 * `read("./ModelModePanel.css")` 会让**整个文件 in-load 失败**（ENOENT），
 * 连带把下面与它无关的「顶栏不重叠」守卫一起打成 suite 级失败。
 *
 * 移进来以后：依赖已删文件的两条用例按预期红（ENOENT，死因明确），
 * 顶栏那三条守卫（A8-A 门禁的一部分）**恢复可运行并全绿**。
 * 这两个文件的最终处置（删除 / 迁移到官方 React 设置面板 / 改写断言）
 * 属产品决定，登记在 HUMAN-人工验证台账 H-07。
 *
 * 🔴 P8 修订（H-07 执行）：上面那两条依赖 `ModelModePanel.css` 的用例**已按 H-07 删除**
 * （`panel-layout.test.ts` 的处置是「**收窄**」而非整文件删 —— 见 PHASE-8 §四 4.3.2 / 陷阱 Y3）。
 * 保留的 4 条用例全部可运行：`API 配置区保持自然高度` + 顶栏 3 条守卫。
 * `.model-panel` / `.model-panel__grid` 的布局不变量随 `ModelModePanel.css` 一起消失，
 * 若 P9 重建模型面板，需为其**新写**布局守卫。
 */
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
  it("API 配置区保持自然高度", () => {
    const body = ruleBody(read("./api-config/ApiConfigSection.css"), ".api-config {");
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
