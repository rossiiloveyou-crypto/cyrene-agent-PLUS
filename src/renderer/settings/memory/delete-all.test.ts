// @vitest-environment jsdom
//
// 「删除全部记忆」危险操作：确认短语门控（不相等就点不动）+ 删除后重启提示 + 失败路径展示。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { modalState } from "../shared/modal-state";
import {
  buildDeleteAllFailureBody,
  deleteAllConfirmPhrase,
  describeDeleteAllFailure,
  isDeleteAllConfirmed,
  runDeleteAllMemoryFlow,
} from "./delete-all";
import { showInputModal } from "../shared/modal";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  modalState.cyOverlay = null;
  modalState.cyHtmlOverlay = null;
  modalState.cyInputOverlay = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function confirmButton(): HTMLButtonElement {
  return document.getElementById("cy-input-confirm") as HTMLButtonElement;
}

function phraseInput(): HTMLInputElement {
  return document.getElementById("cy-input-field") as HTMLInputElement;
}

describe("确认短语判定", () => {
  it("严格等于「确认删除」才算确认", () => {
    expect(deleteAllConfirmPhrase()).toBe("确认删除");
    expect(isDeleteAllConfirmed("确认删除")).toBe(true);
    expect(isDeleteAllConfirmed("确认删除 ")).toBe(false);
    expect(isDeleteAllConfirmed(" 确认删除")).toBe(false);
    expect(isDeleteAllConfirmed("确认")).toBe(false);
    expect(isDeleteAllConfirmed("确认删除！")).toBe(false);
    expect(isDeleteAllConfirmed("")).toBe(false);
  });

  it("失败路径逐行列出，方便用户定位占用文件", () => {
    expect(describeDeleteAllFailure([
      { path: "memory.json", error: "EBUSY" },
      { path: "rag-data/memory-store.json", error: "EPERM" },
    ])).toBe("memory.json（EBUSY）\nrag-data/memory-store.json（EPERM）");
    expect(describeDeleteAllFailure([])).toBe("");
    expect(buildDeleteAllFailureBody([{ path: "memory.json", error: "EBUSY" }])).toContain("memory.json（EBUSY）");
  });
});

describe("确认输入框的门控", () => {
  it("输入不等于确认短语时确认按钮 disabled，相等时可点", async () => {
    const promise = showInputModal({
      title: "删除全部记忆",
      message: "此操作不可撤销，将清空昔涟的所有记忆。请输入「确认删除」以继续：",
      confirmValue: "确认删除",
    });

    const input = phraseInput();
    const confirm = confirmButton();
    expect(confirm.disabled).toBe(true);

    input.value = "确认删";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(confirm.disabled).toBe(true);

    input.value = "确认删除";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(confirm.disabled).toBe(false);

    input.value = "确认删除 ";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(confirm.disabled).toBe(true);

    input.value = "确认删除";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    confirm.click();
    await expect(promise).resolves.toBe("确认删除");
  });

  it("门控未满足时回车不会提交", async () => {
    let settled = false;
    const promise = showInputModal({
      title: "删除全部记忆",
      message: "请输入确认短语",
      confirmValue: "确认删除",
    }).then((value) => {
      settled = true;
      return value;
    });

    const input = phraseInput();
    input.value = "确认";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(settled).toBe(false);

    input.value = "确认删除";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await expect(promise).resolves.toBe("确认删除");
  });

  it("不传 confirmValue 时确认按钮保持可点（老调用方不受影响）", async () => {
    const promise = showInputModal({ title: "测试", message: "输入" });
    expect(confirmButton().disabled).toBe(false);
    confirmButton().click();
    await expect(promise).resolves.toBe("");
  });
});

describe("删除全部记忆流程", () => {
  it("确认后调用 deleteAll，并在需要重启时弹重启提示", async () => {
    const deleteAll = vi.fn(async () => ({ ok: true, deleted: ["memory.json"], failed: [], restartRequired: true }));
    const restartApp = vi.fn(async () => ({ ok: true }));
    Object.assign(window, { memoryPanel: { deleteAll, restartApp } });

    const flow = runDeleteAllMemoryFlow();
    phraseInput().value = "确认删除";
    phraseInput().dispatchEvent(new Event("input", { bubbles: true }));
    confirmButton().click();
    await flush();

    expect(deleteAll).toHaveBeenCalledTimes(1);
    const restartOverlay = document.getElementById("cy-modal-overlay")!;
    expect(restartOverlay.classList.contains("is-hidden")).toBe(false);
    expect(document.getElementById("cy-modal-message")!.textContent).toContain("重启");

    (document.getElementById("cy-modal-confirm") as HTMLButtonElement).click();
    await flow;
    expect(restartApp).toHaveBeenCalledTimes(1);
  });

  it("取消时不会调用 deleteAll", async () => {
    const deleteAll = vi.fn(async () => ({ ok: true, deleted: [], failed: [], restartRequired: true }));
    Object.assign(window, { memoryPanel: { deleteAll } });

    const flow = runDeleteAllMemoryFlow();
    (document.getElementById("cy-input-cancel") as HTMLButtonElement).click();
    await flow;

    expect(deleteAll).not.toHaveBeenCalled();
  });

  it("失败时把失败路径展示给用户", async () => {
    const deleteAll = vi.fn(async () => ({
      ok: false,
      deleted: [],
      failed: [{ path: "memory.json", error: "EBUSY" }],
      restartRequired: true,
    }));
    Object.assign(window, { memoryPanel: { deleteAll } });

    const flow = runDeleteAllMemoryFlow();
    phraseInput().value = "确认删除";
    phraseInput().dispatchEvent(new Event("input", { bubbles: true }));
    confirmButton().click();
    await flush();

    const body = document.getElementById("cy-html-modal-body")!;
    expect(body.textContent).toContain("memory.json");
    expect(body.textContent).toContain("EBUSY");

    // 失败提示是「知道了」单按钮模态框，关掉后流程才结束
    (document.getElementById("cy-html-modal-confirm") as HTMLButtonElement).click();
    await flow;
  });
});
