// @vitest-environment jsdom
//
// 记忆面板「群聊上下文」条数输入框：越界值夹到 3~50、空值回落默认 10、change 即保存。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const html = readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

/** 取记忆面板片段（含群聊上下文输入框与删除全部记忆按钮）。 */
function memoryPanelMarkup(): string {
  const start = html.indexOf('id="memory-panel"');
  if (start < 0) throw new Error("index.html 里找不到 memory-panel");
  const openIndex = html.lastIndexOf("<", start);
  const pattern = /<section\b|<\/section>/g;
  pattern.lastIndex = html.indexOf(">", start) + 1;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[0] === "</section>") {
      depth -= 1;
      if (depth === 0) return html.slice(openIndex, match.index);
    } else {
      depth += 1;
    }
  }
  throw new Error("memory-panel 未闭合");
}

async function loadPanelModule() {
  vi.resetModules();
  return await import("./panel");
}

function stubSettings(getGeneral: () => Promise<unknown>, saveGeneral = vi.fn(async () => ({}))) {
  Object.assign(window, { settings: { getGeneral, saveGeneral } });
  return saveGeneral;
}

beforeEach(() => {
  document.body.innerHTML = memoryPanelMarkup();
  vi.restoreAllMocks();
});

describe("normalizeGroupContextLimit", () => {
  it("越界值夹到 3~50", async () => {
    const { normalizeGroupContextLimit } = await loadPanelModule();
    expect(normalizeGroupContextLimit(1)).toBe(3);
    expect(normalizeGroupContextLimit(0)).toBe(3);
    expect(normalizeGroupContextLimit(-20)).toBe(3);
    expect(normalizeGroupContextLimit(51)).toBe(50);
    expect(normalizeGroupContextLimit(99999)).toBe(50);
  });

  it("小数四舍五入到整数", async () => {
    const { normalizeGroupContextLimit } = await loadPanelModule();
    expect(normalizeGroupContextLimit(10.4)).toBe(10);
    expect(normalizeGroupContextLimit("10.6")).toBe(11);
  });

  it("空值 / 非数字回落默认 10", async () => {
    const { normalizeGroupContextLimit } = await loadPanelModule();
    expect(normalizeGroupContextLimit(undefined)).toBe(10);
    expect(normalizeGroupContextLimit(null)).toBe(10);
    expect(normalizeGroupContextLimit("")).toBe(10);
    expect(normalizeGroupContextLimit("   ")).toBe(10);
    expect(normalizeGroupContextLimit("abc")).toBe(10);
    expect(normalizeGroupContextLimit(NaN)).toBe(10);
  });

  it("合法值原样返回", async () => {
    const { normalizeGroupContextLimit } = await loadPanelModule();
    expect(normalizeGroupContextLimit(3)).toBe(3);
    expect(normalizeGroupContextLimit("25")).toBe(25);
    expect(normalizeGroupContextLimit(50)).toBe(50);
  });
});

describe("群聊上下文输入框", () => {
  it("加载时用通用设置里的值填充输入框", async () => {
    stubSettings(async () => ({ groupContextLimit: 7 }));
    const { loadGroupContextLimit } = await loadPanelModule();
    await loadGroupContextLimit();
    expect((document.getElementById("memory-group-context-limit") as HTMLInputElement).value).toBe("7");
  });

  it("设置里缺失该字段时回落到 10", async () => {
    stubSettings(async () => ({}));
    const { loadGroupContextLimit } = await loadPanelModule();
    await loadGroupContextLimit();
    expect((document.getElementById("memory-group-context-limit") as HTMLInputElement).value).toBe("10");
  });

  it("输入 999 时夹到 50 并把夹取后的值写回输入框", async () => {
    const saveGeneral = stubSettings(async () => ({ groupContextLimit: 10 }));
    const { saveGroupContextLimit } = await loadPanelModule();
    const input = document.getElementById("memory-group-context-limit") as HTMLInputElement;
    input.value = "999";
    await saveGroupContextLimit();
    expect(saveGeneral).toHaveBeenCalledWith({ groupContextLimit: 50 });
    expect(input.value).toBe("50");
  });

  it("输入 1 时夹到 3；输入非数字时回落 10", async () => {
    const saveGeneral = stubSettings(async () => ({ groupContextLimit: 10 }));
    const { saveGroupContextLimit } = await loadPanelModule();
    const input = document.getElementById("memory-group-context-limit") as HTMLInputElement;

    input.value = "1";
    await saveGroupContextLimit();
    expect(saveGeneral).toHaveBeenLastCalledWith({ groupContextLimit: 3 });

    input.value = "abc";
    await saveGroupContextLimit();
    expect(saveGeneral).toHaveBeenLastCalledWith({ groupContextLimit: 10 });
    expect(input.value).toBe("10");
  });

  it("change 事件触发保存并给出已保存反馈", async () => {
    const saveGeneral = stubSettings(async () => ({ groupContextLimit: 10 }));
    const { initGroupContextLimitInput } = await loadPanelModule();
    initGroupContextLimitInput();
    const input = document.getElementById("memory-group-context-limit") as HTMLInputElement;
    input.value = "12";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saveGeneral).toHaveBeenCalledWith({ groupContextLimit: 12 });
    const status = document.getElementById("memory-group-context-status")!;
    expect(status.textContent).toContain("已保存");
    expect(status.classList.contains("is-ok")).toBe(true);
  });

  it("保存失败时提示失败（不静默）", async () => {
    stubSettings(
      async () => ({ groupContextLimit: 10 }),
      vi.fn(async () => {
        throw new Error("ipc boom");
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { saveGroupContextLimit } = await loadPanelModule();
    (document.getElementById("memory-group-context-limit") as HTMLInputElement).value = "20";
    await saveGroupContextLimit();
    const status = document.getElementById("memory-group-context-status")!;
    expect(status.textContent).toContain("失败");
    expect(status.classList.contains("is-error")).toBe(true);
  });
});
