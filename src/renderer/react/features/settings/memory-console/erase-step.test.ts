/**
 * H-22 回归测试：「彻底擦除」的两个弹窗**必须串行**，不能同开。
 *
 * 缺陷原状（2026-10-01 复现）：`MemoryManagerSection` 里预演与强确认两个 `<Modal>` 的 `open`
 * 都绑 `Boolean(erase)` ⇒ 同开、确认框压住预演 ⇒ 用户**看不到「会删什么」就要打确认短语**，
 * 知情同意在视觉上失效。当时该组件**零渲染测试覆盖**，所以这类「哪个面板该开」的判断
 * 被提成纯函数（`./erase-step`）后由本文件钉死。
 */

import { describe, expect, it } from "vitest";

import {
  backToPreview,
  cancelEraseFlow,
  continueFromPreview,
  eraseModalVisibility,
  startEraseFlow,
  typeErasePhrase,
} from "./erase-step";

describe("H-22 · 擦除两弹窗的互斥", () => {
  it("任何阶段都**不会两个同时开**（这正是缺陷的判据）", () => {
    for (const step of [undefined, null, "preview", "confirm"] as const) {
      const { previewOpen, confirmOpen } = eraseModalVisibility(step);
      expect(previewOpen && confirmOpen, `step=${String(step)} 时两个弹窗同开`).toBe(false);
    }
  });

  it("没有流程时两个都关；preview 只开预演；confirm 只开确认", () => {
    expect(eraseModalVisibility(null)).toEqual({ previewOpen: false, confirmOpen: false });
    expect(eraseModalVisibility(undefined)).toEqual({ previewOpen: false, confirmOpen: false });
    expect(eraseModalVisibility("preview")).toEqual({ previewOpen: true, confirmOpen: false });
    expect(eraseModalVisibility("confirm")).toEqual({ previewOpen: false, confirmOpen: true });
  });

  it("「我已了解，继续」才进确认框（预演不能跳过）", () => {
    const started = startEraseFlow({ previewId: "p1" });
    expect(started.step).toBe("preview");
    expect(eraseModalVisibility(started.step)).toEqual({ previewOpen: true, confirmOpen: false });

    const next = continueFromPreview(started);
    expect(next?.step).toBe("confirm");
    expect(eraseModalVisibility(next?.step)).toEqual({ previewOpen: false, confirmOpen: true });
  });

  it("确认框「返回预演」退回看清内容，而不是丢掉整个流程", () => {
    const atConfirm = continueFromPreview(startEraseFlow({ previewId: "p1" }));
    const back = backToPreview(atConfirm);
    expect(back?.step).toBe("preview");
    // 方案与轮次必须还在（否则用户「返回」后看到空弹窗）
    expect(back?.plan).toEqual({ previewId: "p1" });
    expect(back?.round).toBe(0);
  });

  it("取消会关掉两个弹窗", () => {
    expect(cancelEraseFlow()).toBeNull();
    expect(continueFromPreview(null)).toBeNull();
    expect(backToPreview(null)).toBeNull();
    expect(typeErasePhrase(null, "彻底擦除")).toBeNull();
  });

  it("重新预演总是回到 preview（重确认后不会直接落在确认框）", () => {
    const round2 = startEraseFlow({ previewId: "p2" }, 2);
    expect(round2.step).toBe("preview");
    expect(round2.round).toBe(2);
    expect(round2.typed).toBe("");
  });

  it("输短语与阶段切换互不干扰（往返不丢已输入内容）", () => {
    let state = continueFromPreview(startEraseFlow({ previewId: "p1" }));
    state = typeErasePhrase(state, "彻底擦除");
    expect(state?.typed).toBe("彻底擦除");

    // 返回预演 → 再进确认：短语应保留（重确认时用户不必重打）
    state = backToPreview(state);
    expect(state?.typed).toBe("彻底擦除");
    state = continueFromPreview(state);
    expect(state?.typed).toBe("彻底擦除");
  });

  it("预演方案在整条链路上不被改动（守卫依赖 previewId 非空）", () => {
    const plan = { previewId: "abc123", personKey: "qq:10001" };
    let state = startEraseFlow(plan);
    state = continueFromPreview(state);
    state = typeErasePhrase(state, "彻底擦除");
    expect(state?.plan).toBe(plan);
  });
});
