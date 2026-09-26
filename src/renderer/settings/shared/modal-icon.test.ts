// @vitest-environment jsdom
//
// 弹窗图标渲染守卫。
//
// 回归背景：「新建区块」弹窗（showInputModal 不传 icon）曾把默认图标的 `<svg …>`
// 标记用 `textContent` 写进 DOM，整段标记被当普通文字渲染，盖住弹窗成为乱码。
// 这里锁住三条不变量：
//   1. 不传 icon → 渲染出真正的 SVG 元素，而不是 "<svg" 这段文字；
//   2. 传 emoji / 纯文本 → 走 textContent（不会被当成 HTML 解析）；
//   3. 传 SVG 片段 → 走 innerHTML（能渲染成图标）。
// 另外守住"上一次调用的图标不会残留"——默认图标必须每次都能复位。

import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_INPUT_MODAL_ICON, applyModalIcon, showHtmlModal, showInputModal, showModal } from "./modal";
import { modalState } from "./modal-state";

const PENCIL_SVG = '<svg data-testid="pencil" width="24" height="24"></svg>';
const TRASH_SVG = '<svg data-testid="trash" width="18" height="18"></svg>';

function resetModalDom(): void {
  modalState.cyOverlay = null;
  modalState.cyHtmlOverlay = null;
  modalState.cyInputOverlay = null;
  document.body.innerHTML = "";
}

beforeEach(resetModalDom);

describe("applyModalIcon", () => {
  it("回退值以 < 开头时按 HTML 渲染", () => {
    const el = document.createElement("span");
    applyModalIcon(el, undefined, PENCIL_SVG);
    expect(el.querySelector("svg")).not.toBeNull();
    expect(el.textContent).toBe("");
  });

  it("纯文本图标走 textContent，不会被当成 HTML 解析", () => {
    const el = document.createElement("span");
    applyModalIcon(el, "⚠️", "📌");
    expect(el.textContent).toBe("⚠️");
    expect(el.querySelector("b")).toBeNull();
  });

  it("以 < 开头的图标走 innerHTML（项目内固定的 SVG 片段）", () => {
    const el = document.createElement("span");
    applyModalIcon(el, TRASH_SVG, "📌");
    expect(el.querySelector('[data-testid="trash"]')).not.toBeNull();
  });

  it("空字符串视同未传，走回退值", () => {
    const el = document.createElement("span");
    applyModalIcon(el, "", "📌");
    expect(el.textContent).toBe("📌");
  });
});

describe("showInputModal 图标", () => {
  it("不传 icon 时渲染默认铅笔 SVG，而不是把标记当文字显示", () => {
    void showInputModal({ title: "新建区块", message: "给这个区块起个名字" });

    const icon = document.getElementById("cy-input-icon")!;
    expect(icon.querySelector("svg")).not.toBeNull();
    // 这条断言就是那个乱码 bug：标记必须不在可见文字里
    expect(icon.textContent).not.toContain("<svg");
    expect(icon.textContent).not.toContain("</svg>");
    expect(icon.textContent).toBe("");
  });

  it("默认图标与模块常量同源（markup 与运行时不会各写一份）", () => {
    void showInputModal({ title: "新建区块", message: "名字" });
    const icon = document.getElementById("cy-input-icon")!;
    const svg = icon.querySelector("svg")!;
    // jsdom 会把自闭合 <path /> 规范化成 <path></path>，所以比结构而不是字符串
    expect(svg.getAttribute("viewBox")).toBe("0 0 48 48");
    expect(svg.querySelectorAll("path")).toHaveLength(2);
    expect(DEFAULT_INPUT_MODAL_ICON).toContain('viewBox="0 0 48 48"');
  });

  it("传 emoji 时显示 emoji（覆盖默认铅笔，且不残留旧图标）", () => {
    void showInputModal({ title: "删除全部记忆", message: "输入确认短语", icon: "🗑️" });
    let icon = document.getElementById("cy-input-icon")!;
    expect(icon.textContent).toBe("🗑️");
    expect(icon.querySelector("svg")).toBeNull();

    // 第二次不传 icon：必须复位成默认铅笔，不能沿用上一次的 emoji
    void showInputModal({ title: "新建区块", message: "名字" });
    icon = document.getElementById("cy-input-icon")!;
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(icon.textContent).toBe("");
  });

  it("传 SVG 片段时渲染成图标", () => {
    void showInputModal({ title: "输入", message: "内容", icon: TRASH_SVG });
    const icon = document.getElementById("cy-input-icon")!;
    expect(icon.querySelector('[data-testid="trash"]')).not.toBeNull();
    expect(icon.textContent).toBe("");
  });
});

describe("showModal / showHtmlModal 图标", () => {
  it("showModal 的 emoji 与 SVG 两种形态都能正确渲染", async () => {
    void showModal({ title: "提示", message: "确认？", icon: "⚠️" });
    let icon = document.getElementById("cy-modal-icon")!;
    expect(icon.textContent).toBe("⚠️");
    expect(icon.querySelector("svg")).toBeNull();

    resetModalDom();
    void showModal({ title: "提示", message: "确认？", icon: TRASH_SVG });
    icon = document.getElementById("cy-modal-icon")!;
    expect(icon.querySelector('[data-testid="trash"]')).not.toBeNull();
    expect(icon.textContent).not.toContain("<svg");
  });

  it("showHtmlModal 传 SVG 时渲染成图标（MCP 说明弹窗的用法）", () => {
    void showHtmlModal({ title: "说明", htmlBody: "<p>x</p>", icon: TRASH_SVG });
    const icon = document.getElementById("cy-html-modal-icon")!;
    expect(icon.querySelector('[data-testid="trash"]')).not.toBeNull();
    expect(icon.textContent).not.toContain("<svg");
  });
});
