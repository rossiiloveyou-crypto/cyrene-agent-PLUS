// @vitest-environment jsdom
/**
 * 控制台「关键词策略」区块的真实渲染测试。
 *
 * 为什么要有它：`keywords-contract.test.ts` 只能证明**源码里接了线**，
 * 证明不了「渲染出来样子对、值预填对、保存时真的把两个输入框的内容发出去」。
 * 这里用 jsdom + 真实 React 渲染（`react-dom/client` + `act`），
 * 并 mock 掉 `window.settings` 与 `useTranslation`。
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ToolConsolePanel } from "./ToolConsolePanel";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const ALLOWLIST = { groupMemberGate: true, toolGate: true, entries: [] };

interface Harness {
  container: HTMLElement;
  root: Root;
  saveConfig: ReturnType<typeof vi.fn>;
}

async function mountPanel(options: {
  keywords?: { intercept?: string[]; trigger?: string[] };
  withSaveConfig?: boolean;
  config?: Record<string, unknown>;
} = {}): Promise<Harness> {
  const { keywords = { intercept: [], trigger: [] }, withSaveConfig = true, config } = options;
  const saveConfig = vi.fn(async (patch: unknown) => config ?? { keywords, ...(patch as object) });

  (window as unknown as { settings: unknown }).settings = {
    channelsToolAccessGet: async () => ALLOWLIST,
    channelsAuditGet: async () => [],
    channelsGetConfig: async () => ({ audit: { recordSuccessTurns: false }, keywords }),
    ...(withSaveConfig ? { channelsSaveConfig: saveConfig } : {}),
    channelsKeywordsImportTxt: async () => ({ ok: true as const, keywords: ["导入A", "导入B"], fileName: "k.txt" }),
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ToolConsolePanel));
  });
  return { container, root, saveConfig };
}

function textareas(container: HTMLElement): HTMLTextAreaElement[] {
  return [...container.querySelectorAll<HTMLTextAreaElement>("textarea.tool-console__keyword-input")];
}

function setTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("控制台关键词策略区块（真实渲染）", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("渲染出「关键词策略」区块与两个输入框，并把已落盘的关键词预填进去", async () => {
    const { container, root } = await mountPanel({
      keywords: { intercept: ["010101"], trigger: ["ufhiuehfhefiwef", "昔涟"] },
    });

    expect(container.textContent).toContain("toolConsole.keywordsTitle");
    const boxes = textareas(container);
    expect(boxes.length).toBe(2);
    // 顺序：第 1 个是拦截词、第 2 个是触发词（与主进程字段名一致）
    expect(boxes[0].value).toBe("010101");
    expect(boxes[1].value).toBe("ufhiuehfhefiwef\n昔涟");
    // 两个「从 txt 导入」+ 一个保存按钮
    expect(container.textContent).toContain("toolConsole.keywordsSave");

    await act(async () => root.unmount());
  });

  it("点保存时把两个输入框的内容按行切成数组、两类一起发出去", async () => {
    const { container, root, saveConfig } = await mountPanel();
    const boxes = textareas(container);

    await act(async () => {
      setTextareaValue(boxes[0], "拦截一\n\n  拦截二  \n");
      setTextareaValue(boxes[1], "触发一");
    });
    await act(async () => {
      container
        .querySelectorAll<HTMLButtonElement>("button.tool-console__primary")
        .forEach((button) => button.click());
    });

    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(saveConfig.mock.calls[0][0]).toEqual({
      keywords: { intercept: ["拦截一", "拦截二"], trigger: ["触发一"] },
    });
    // 保存成功提示
    expect(container.textContent).toContain("toolConsole.keywordsSaved");

    await act(async () => root.unmount());
  });

  it("保存后用主进程回传的归一化结果回填输入框（界面与磁盘一致）", async () => {
    const { container, root } = await mountPanel({
      keywords: { intercept: [], trigger: [] },
      config: { keywords: { intercept: ["去重后"], trigger: ["a", "b"] } },
    });
    const boxes = textareas(container);

    await act(async () => {
      setTextareaValue(boxes[0], "去重后\n去重后\n去重后");
    });
    await act(async () => {
      container
        .querySelectorAll<HTMLButtonElement>("button.tool-console__primary")
        .forEach((button) => button.click());
    });

    const after = textareas(container);
    expect(after[0].value).toBe("去重后");
    expect(after[1].value).toBe("a\nb");

    await act(async () => root.unmount());
  });

  it("没有 channelsSaveConfig 通道时不渲染编辑区（避免点了没反应）", async () => {
    const { container, root } = await mountPanel({ withSaveConfig: false });

    expect(textareas(container).length).toBe(0);
    expect(container.textContent).not.toContain("toolConsole.keywordsTitle");
    // 其余区块照常渲染
    expect(container.textContent).toContain("toolConsole.allowlistTitle");

    await act(async () => root.unmount());
  });

  it("「从 txt 导入」把结果追加进对应输入框而不是覆盖", async () => {
    const { container, root } = await mountPanel({ keywords: { intercept: ["已有"], trigger: [] } });
    const boxes = textareas(container);

    const importButtons = [...container.querySelectorAll<HTMLButtonElement>("button.tool-console__ghost")];
    expect(importButtons.length).toBe(2);
    await act(async () => {
      importButtons[0].click();
    });

    expect(textareas(container)[0].value).toBe("已有\n导入A\n导入B");
    expect(container.textContent).toContain("toolConsole.keywordsImported");

    await act(async () => root.unmount());
  });
});
