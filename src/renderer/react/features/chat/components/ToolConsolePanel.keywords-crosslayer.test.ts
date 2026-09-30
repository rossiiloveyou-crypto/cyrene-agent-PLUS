// @vitest-environment jsdom
/**
 * 跨层契约：**控制台面板发出的 patch → 主进程真落库**。
 *
 * 为什么需要这两层接起来测：
 * - `keywords-render.test.ts` 只证明面板发出的 patch 形状（用的是 mock 保存函数）；
 * - `settings-store.test.ts` 只证明主进程能把 `{ keywords }` 正确归一化并浅合并；
 * - 两者之间的**漂移**（面板改成只传一类、或主进程换了字段名）两边各自都测不出来，
 *   而线上表现恰好是「点了保存没反应 / 另一类被清空」。
 *
 * 这里让面板走真实的 `saveChannelsSettings`（落到临时 userData 目录），
 * 断言写进 `channels-settings.json` 的内容与界面一致。
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-keywords-crosslayer-"));

vi.mock("electron", () => ({
  app: {
    getPath: () => userDataDir,
    getName: () => "cyrene-keywords-test",
    isReady: () => true,
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (plain: string) => Buffer.from(plain, "utf8"),
    decryptString: (buf: Buffer) => buf.toString("utf8"),
  },
}));

vi.mock("../../../i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// eslint-disable-next-line import/first
import { ToolConsolePanel } from "./ToolConsolePanel";
// eslint-disable-next-line import/first
import { loadChannelsSettings, saveChannelsSettings } from "../../../../../main/channels/settings-store";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const settingsFile = path.join(userDataDir, "channels-settings.json");

function readKeywordsOnDisk(): { intercept: string[]; trigger: string[] } {
  const raw = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as {
    keywords: { intercept: string[]; trigger: string[] };
  };
  return raw.keywords;
}

function textareas(container: HTMLElement): HTMLTextAreaElement[] {
  return [...container.querySelectorAll<HTMLTextAreaElement>("textarea.tool-console__keyword-input")];
}

function setTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 用真实的 saveChannelsSettings 代替 IPC，其它通道给最小桩。 */
async function mountWithRealStore(): Promise<{ container: HTMLElement; root: Root }> {
  (window as unknown as { settings: unknown }).settings = {
    channelsToolAccessGet: async () => ({ groupMemberGate: true, toolGate: true, entries: [] }),
    channelsAuditGet: async () => [],
    channelsGetConfig: async () => {
      const current = loadChannelsSettings();
      return { audit: current.audit, keywords: current.keywords };
    },
    channelsSaveConfig: async (patch: unknown) => saveChannelsSettings(patch as never),
    channelsKeywordsImportTxt: async () => ({ ok: true as const, keywords: ["导入词"], fileName: "k.txt" }),
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ToolConsolePanel));
  });
  return { container, root };
}

async function clickSave(container: HTMLElement): Promise<void> {
  await act(async () => {
    container
      .querySelectorAll<HTMLButtonElement>("button.tool-console__primary")
      .forEach((button) => button.click());
  });
}

describe("面板 → 主进程落库 跨层契约", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    fs.rmSync(settingsFile, { force: true });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("在界面里输入并保存后，channels-settings.json 里出现同样的关键词", async () => {
    const { container, root } = await mountWithRealStore();
    const boxes = textareas(container);

    await act(async () => {
      setTextareaValue(boxes[0], "测试拦截");
      setTextareaValue(boxes[1], "测试触发");
    });
    await clickSave(container);

    expect(readKeywordsOnDisk()).toEqual({ intercept: ["测试拦截"], trigger: ["测试触发"] });
    expect(container.textContent).toContain("toolConsole.keywordsSaved");

    await act(async () => root.unmount());
  });

  it("主进程的归一化结果会回灌界面：重复项与空行被清掉", async () => {
    const { container, root } = await mountWithRealStore();
    const boxes = textareas(container);

    await act(async () => {
      setTextareaValue(boxes[0], "重复\n重复\n\n  重复  \n");
    });
    await clickSave(container);

    expect(readKeywordsOnDisk().intercept).toEqual(["重复"]);
    expect(textareas(container)[0].value).toBe("重复");

    await act(async () => root.unmount());
  });

  it("清空输入框并保存能真正清空该列（空数组不是「不传」）", async () => {
    saveChannelsSettings({ keywords: { intercept: ["旧拦截"], trigger: ["旧触发"] } });

    const { container, root } = await mountWithRealStore();
    expect(textareas(container)[0].value).toBe("旧拦截");

    await act(async () => {
      setTextareaValue(textareas(container)[0], "");
    });
    await clickSave(container);

    expect(readKeywordsOnDisk()).toEqual({ intercept: [], trigger: ["旧触发"] });

    await act(async () => root.unmount());
  });

  it("面板读回主进程的当前值：刷新后界面与磁盘一致", async () => {
    saveChannelsSettings({ keywords: { intercept: ["甲"], trigger: ["乙", "丙"] } });

    const { container, root } = await mountWithRealStore();
    const boxes = textareas(container);

    expect(boxes[0].value).toBe("甲");
    expect(boxes[1].value).toBe("乙\n丙");

    await act(async () => root.unmount());
  });
});
