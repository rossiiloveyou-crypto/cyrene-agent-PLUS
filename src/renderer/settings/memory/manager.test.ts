// @vitest-environment jsdom
//
// 「记忆管理」控制台的 jsdom 运行时用例（P3 §2.17 / §4.6）。
//
// 覆盖：三视图切换、列表渲染（按人视图两个数字分开给）、列表勾选与批量条、
// pruneManagerSelection、列表 ↔ 详情两态、详情两组分开显示与分开勾选、
// 「彻底擦除」只在详情区且仅 erasable 时可用、溯源渲染（含 missing 态）。
//
// 注入的 markup 与 memory/panel.test.ts 一致：把 index.html 里 `#memory-panel` 那一段
// 整体抽出来塞进 jsdom —— 段外的 id 在这里根本不存在，正好锁住「必须放进 #memory-panel」。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const html = readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const PEOPLE_ITEMS = [
  { key: "qq:10001", label: "小明", sublabel: "10001", total: 12, own: 4, mentioned: 8, sessions: 2, erasable: true },
  { key: "qq:10002", label: "小红", sublabel: "10002", total: 5, own: 5, mentioned: 0, sessions: 1, erasable: true },
  { key: "__unattributed__", label: "来源未知（无归属记忆）", total: 37, own: 37, mentioned: 0, sessions: 0, erasable: false },
];

const DETAIL_MEMORIES = [
  {
    id: "m-own-1", content: "我最近在学 Rust", triggerText: "我最近在学 Rust", createdAt: 1737000000000,
    status: "active", sourceConversationId: "channel:qq:aaaa", speakerIds: ["qq:10001"], subjectIds: ["qq:10001"],
  },
  {
    id: "m-own-2", content: "昨天去看了展", triggerText: "", createdAt: 1737100000000,
    status: "aging", sourceConversationId: "channel:qq:aaaa", speakerIds: ["qq:10001"],
  },
  {
    id: "m-mentioned-1", content: "小明最近在学 Rust", triggerText: "小明最近在学 Rust", createdAt: 1737200000000,
    status: "active", sourceConversationId: "channel:qq:bbbb", speakerIds: ["qq:10002"], subjectIds: ["qq:10001"],
  },
];

const DETAIL_META = {
  total: 3, own: 2, mentioned: 1, personKey: "qq:10001",
  sessions: [
    { sessionId: "channel:qq:aaaa", label: "私聊", count: 2 },
    { sessionId: "channel:qq:bbbb", label: "测试群", count: 1 },
  ],
};

function stubMemoryPanel(overrides: Record<string, unknown> = {}) {
  const api = {
    listMemoryManager: vi.fn(async () => ({ items: PEOPLE_ITEMS })),
    queryMemoryManager: vi.fn(async () => ({ memories: DETAIL_MEMORIES, meta: DETAIL_META })),
    deleteMemoryManager: vi.fn(async () => ({
      requested: 2, removed: 2, evidence: 1, dmaeStates: 1, conflictLogs: 0,
      danglingRefsFixed: 1, reflectionLogs: 0, summariesRemoved: 0, vectors: 2,
    })),
    traceMemorySource: vi.fn(async () => ({
      entries: [
        { role: "user", content: "你不是讨厌美式吗？", at: "2024-09-24T10:00:00.000Z", speakerName: "小红", speakerId: "10002", file: "channel_qq_bbbb.jsonl" },
        { role: "user", content: "我最近改喝美式了", at: "2024-09-24T10:01:00.000Z", speakerName: "小明", speakerId: "10001", file: "channel_qq_bbbb.jsonl" },
      ],
      missing: false,
    })),
    erasePreview: vi.fn(),
    erasePerson: vi.fn(),
    ...overrides,
  };
  Object.assign(window, { memoryPanel: api });
  return api;
}

async function loadManager() {
  vi.resetModules();
  return await import("./manager");
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 不存在`);
  return el as T;
}

beforeEach(() => {
  document.body.innerHTML = memoryPanelMarkup();
  vi.restoreAllMocks();
});

describe("三视图与列表", () => {
  it("进入面板后按「按人」加载列表，两个数字分开显示", async () => {
    const api = stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();

    expect(api.listMemoryManager).toHaveBeenCalledWith("people");
    const list = byId("memory-manager-list");
    expect(list.textContent).toContain("小明");
    expect(list.textContent).toContain("10001");
    // 🗣 他的记忆 / 👥 别人提到他 两个数字必须分开给（doc §2.17）
    expect(list.textContent).toContain("他的记忆 4 条");
    expect(list.textContent).toContain("别人提到他 8 条");
    expect(list.querySelectorAll('[data-manager-action="open-detail"]')).toHaveLength(3);
  });

  it("切换视图用新的 view 重新加载，并更新 radiogroup 状态", async () => {
    const api = stubMemoryPanel();
    const { loadMemoryManager, managerState } = await loadManager();
    await loadMemoryManager();

    byId("memory-manager-view-zones").click();
    await flush();

    expect(managerState.view).toBe("zones");
    expect(api.listMemoryManager).toHaveBeenLastCalledWith("zones");
    expect(byId("memory-manager-view-zones").getAttribute("aria-pressed")).toBe("true");
    expect(byId("memory-manager-view-people").getAttribute("aria-pressed")).toBe("false");
  });

  it("空列表渲染空态而不是崩在 items[0]", async () => {
    stubMemoryPanel({ listMemoryManager: vi.fn(async () => ({ items: [] })) });
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    expect(byId("memory-manager-list").textContent).toContain("还没有按人归类的记忆");
  });

  it("列表加载失败时给反馈并显示空态（不静默）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubMemoryPanel({ listMemoryManager: vi.fn(async () => { throw new Error("ipc boom"); }) });
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    expect(byId("memory-manager-feedback").textContent).toContain("ipc boom");
    expect(byId("memory-manager-feedback").className).toContain("memory-manager__feedback--err");
  });

  it("事件委托只绑一次（loadMemoryManager 会被反复调用）", async () => {
    const api = stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    await loadMemoryManager();
    expect(api.listMemoryManager).toHaveBeenCalledTimes(2);

    byId("memory-manager-refresh-btn").click();
    await flush();
    // 只多了一次（如果每次都绑一遍，这里会是 4 次）
    expect(api.listMemoryManager).toHaveBeenCalledTimes(3);
  });
});

describe("列表勾选与批量条", () => {
  function itemCheckbox(key: string): HTMLInputElement {
    const el = byId("memory-manager-list").querySelector<HTMLInputElement>(`input[data-manager-key="${key}"]`);
    if (!el) throw new Error(`找不到 ${key} 的勾选框`);
    return el;
  }

  it("勾选后批量条出现并给出计数，取消勾选后收起", async () => {
    stubMemoryPanel();
    const { loadMemoryManager, managerState } = await loadManager();
    await loadMemoryManager();

    expect(byId("memory-manager-batch-bar").classList.contains("is-hidden")).toBe(true);

    const box = itemCheckbox("qq:10001");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));

    expect(managerState.selected.has("qq:10001")).toBe(true);
    expect(byId("memory-manager-batch-bar").classList.contains("is-hidden")).toBe(false);
    expect(byId("memory-manager-batch-count").textContent).toContain("已选 1 项");
    expect(byId<HTMLButtonElement>("memory-manager-batch-delete-btn").disabled).toBe(false);

    const refreshed = itemCheckbox("qq:10001");
    refreshed.checked = false;
    refreshed.dispatchEvent(new Event("change", { bubbles: true }));

    expect(managerState.selected.size).toBe(0);
    expect(byId("memory-manager-batch-bar").classList.contains("is-hidden")).toBe(true);
  });

  it("pruneManagerSelection 丢弃列表里已不存在的 key", async () => {
    const api = stubMemoryPanel();
    const { loadMemoryManager, managerState, pruneManagerSelection } = await loadManager();
    await loadMemoryManager();

    managerState.selected.add("qq:10002");
    managerState.selected.add("qq:99999");
    pruneManagerSelection(managerState.items);

    expect(Array.from(managerState.selected)).toEqual(["qq:10002"]);
    // api 只是桩，防止 lint 抱怨未使用
    expect(api.listMemoryManager).toHaveBeenCalled();
  });

  it("按容器批量删除：确认后逐个调用 deleteMemoryManager({ view, key }) 并刷新", async () => {
    const api = stubMemoryPanel();
    const { loadMemoryManager, managerState } = await loadManager();
    await loadMemoryManager();

    for (const key of ["qq:10001", "qq:10002"]) {
      const box = itemCheckbox(key);
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
    byId("memory-manager-batch-delete-btn").click();
    await flush();

    // 先弹确认框（危险动作不静默执行）
    expect(api.deleteMemoryManager).not.toHaveBeenCalled();
    (document.getElementById("cy-modal-confirm") as HTMLButtonElement).click();
    await flush();

    expect(api.deleteMemoryManager).toHaveBeenCalledWith({ view: "people", key: "qq:10001" });
    expect(api.deleteMemoryManager).toHaveBeenCalledWith({ view: "people", key: "qq:10002" });
    expect(managerState.selected.size).toBe(0);
    expect(api.listMemoryManager).toHaveBeenCalledTimes(2);
  });

  it("取消确认框时一条也不删", async () => {
    const api = stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();

    const box = itemCheckbox("qq:10001");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    byId("memory-manager-batch-delete-btn").click();
    await flush();

    (document.getElementById("cy-modal-cancel") as HTMLButtonElement).click();
    await flush();
    expect(api.deleteMemoryManager).not.toHaveBeenCalled();
  });
});

describe("列表 ↔ 详情两态", () => {
  it("点「查看」进详情：列表收起、详情展开，两组分开显示，彻底擦除可用", async () => {
    stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();

    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-key="qq:10001"] [data-manager-action="open-detail"]')!.click();
    await flush();

    expect(byId("memory-manager-detail").classList.contains("is-hidden")).toBe(false);
    // 详情是两态之一：列表同时收起
    expect(byId("memory-manager-list").classList.contains("is-hidden")).toBe(true);
    expect(byId("memory-manager-batch-bar").classList.contains("is-hidden")).toBe(true);

    expect(byId("memory-manager-detail-title").textContent).toContain("小明");
    expect(byId("memory-manager-detail-title").textContent).toContain("10001");
    const summary = byId("memory-manager-detail-summary").textContent ?? "";
    expect(summary).toContain("他的记忆 2 条");
    expect(summary).toContain("别人提到他 1 条");

    const detailList = byId("memory-manager-detail-list");
    expect(detailList.textContent).toContain("🗣 他的记忆");
    expect(detailList.textContent).toContain("👥 别人提到他");
    // 两组必须各自成块、各自计数
    expect(detailList.querySelectorAll(".memory-manager__group--own")).toHaveLength(1);
    expect(detailList.querySelectorAll(".memory-manager__group--mentioned")).toHaveLength(1);
    expect(detailList.querySelectorAll('input[data-manager-group="own"]')).toHaveLength(2);
    expect(detailList.querySelectorAll('input[data-manager-group="mentioned"]')).toHaveLength(1);

    const eraseBtn = byId<HTMLButtonElement>("memory-manager-erase-btn");
    expect(eraseBtn.classList.contains("is-hidden")).toBe(false);
    expect(eraseBtn.disabled).toBe(false);
    expect(eraseBtn.className).toContain("ghost-btn--danger");
  });

  it("「来源未知」（erasable=false）的详情里没有可用的彻底擦除", async () => {
    stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();

    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-key="__unattributed__"] [data-manager-action="open-detail"]')!.click();
    await flush();

    const eraseBtn = byId<HTMLButtonElement>("memory-manager-erase-btn");
    expect(eraseBtn.disabled).toBe(true);
    expect(eraseBtn.classList.contains("is-hidden")).toBe(true);
  });

  it("关闭按钮回到列表态", async () => {
    stubMemoryPanel();
    const { loadMemoryManager, managerState } = await loadManager();
    await loadMemoryManager();
    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-action="open-detail"]')!.click();
    await flush();
    expect(managerState.detail).not.toBeNull();

    byId("memory-manager-detail-close-btn").click();
    expect(managerState.detail).toBeNull();
    expect(byId("memory-manager-detail").classList.contains("is-hidden")).toBe(true);
    expect(byId("memory-manager-list").classList.contains("is-hidden")).toBe(false);
  });

  it("详情取数失败时给反馈（不假装加载成功）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubMemoryPanel({ queryMemoryManager: vi.fn(async () => { throw new Error("query boom"); }) });
    const { loadMemoryManager, managerState } = await loadManager();
    await loadMemoryManager();
    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-action="open-detail"]')!.click();
    await flush();
    expect(managerState.detail).toBeNull();
    expect(byId("memory-manager-feedback").textContent).toContain("query boom");
  });

  it("classifyManagerMemory：只有 subjectIds 命中才算「别人提到他」", async () => {
    const { classifyManagerMemory } = await loadManager();
    expect(classifyManagerMemory({ speakerIds: ["qq:10001"], subjectIds: ["qq:10001"] }, "qq:10001")).toBe("own");
    expect(classifyManagerMemory({ speakerIds: ["qq:10001"] }, "qq:10001")).toBe("own");
    expect(classifyManagerMemory({ speakerIds: ["qq:10002"], subjectIds: ["qq:10001"] }, "qq:10001")).toBe("mentioned");
    // 无归属（私聊里的 legacy 行）= R1，归「他的记忆」
    expect(classifyManagerMemory({}, "qq:10001")).toBe("own");
    // 无 personKey（域 / 会话视图）不分组
    expect(classifyManagerMemory({ subjectIds: ["qq:10001"] }, undefined)).toBe("own");
  });
});

describe("详情：分开勾选与删除", () => {
  function openDetail() {
    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-key="qq:10001"] [data-manager-action="open-detail"]')!.click();
  }

  function memoryBox(id: string): HTMLInputElement {
    const el = byId("memory-manager-detail-list").querySelector<HTMLInputElement>(`input[data-memory-id="${id}"]`);
    if (!el) throw new Error(`找不到记忆 ${id} 的勾选框`);
    return el;
  }

  it("勾选「他的记忆」直接删除（不弹 K 类警告）", async () => {
    const api = stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    openDetail();
    await flush();

    const box = memoryBox("m-own-1");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));

    expect(byId<HTMLButtonElement>("memory-manager-detail-delete-btn").disabled).toBe(false);
    byId("memory-manager-detail-delete-btn").click();
    await flush();

    expect(api.deleteMemoryManager).toHaveBeenCalledWith({ ids: ["m-own-1"] });
    // 反馈里必须带上向量条数：向量漏删是 §5.2 第 2 步抓到过的真缺陷，
    // 用户在界面上看得到"向量删了几条"才谈得上核对（stub 返回 vectors: 2）。
    expect(byId("memory-manager-feedback").textContent).toContain("向量 2");
    // 没有警告弹窗（overlay 未创建或仍隐藏）
    const overlay = document.getElementById("cy-modal-overlay");
    expect(overlay === null || overlay.classList.contains("is-hidden")).toBe(true);
  });

  it("勾选「别人提到他」时先警告（会连带动到说话人），取消则不删", async () => {
    const api = stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    openDetail();
    await flush();

    const box = memoryBox("m-mentioned-1");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    byId("memory-manager-detail-delete-btn").click();
    await flush();

    expect(api.deleteMemoryManager).not.toHaveBeenCalled();
    const message = document.getElementById("cy-modal-message")!.textContent ?? "";
    expect(message).toContain("别人提到他");
    expect(message).toContain("qq:10002");

    (document.getElementById("cy-modal-cancel") as HTMLButtonElement).click();
    await flush();
    expect(api.deleteMemoryManager).not.toHaveBeenCalled();
  });

  it("两组分开计数（各自的已选 N 条）", async () => {
    stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    openDetail();
    await flush();

    const ownBox = memoryBox("m-own-2");
    ownBox.checked = true;
    ownBox.dispatchEvent(new Event("change", { bubbles: true }));
    const mentionedBox = memoryBox("m-mentioned-1");
    mentionedBox.checked = true;
    mentionedBox.dispatchEvent(new Event("change", { bubbles: true }));

    const groups = byId("memory-manager-detail-list").querySelectorAll(".memory-manager__group");
    expect(groups[0].textContent).toContain("已选 1 条");
    expect(groups[1].textContent).toContain("已选 1 条");
    expect(byId("memory-manager-detail-delete-btn").textContent).toContain("删除所选（2）");
  });
});

describe("溯源", () => {
  it("渲染返回的 transcript 行（[说话人]: 正文）", async () => {
    stubMemoryPanel();
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-action="open-detail"]')!.click();
    await flush();

    byId("memory-manager-detail-list").querySelector<HTMLElement>('[data-memory-id="m-own-1"][data-manager-action="trace"]')!.click();
    await flush();

    const trace = byId("memory-manager-trace");
    expect(trace.classList.contains("is-hidden")).toBe(false);
    expect(trace.textContent).toContain("[小红]:");
    expect(trace.textContent).toContain("你不是讨厌美式吗？");
    expect(trace.textContent).toContain("[小明]:");
  });

  it("missing=true 时显示「来源不可用」", async () => {
    stubMemoryPanel({ traceMemorySource: vi.fn(async () => ({ entries: [], missing: true })) });
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-action="open-detail"]')!.click();
    await flush();

    byId("memory-manager-detail-list").querySelector<HTMLElement>('[data-manager-action="trace"]')!.click();
    await flush();

    expect(byId("memory-manager-trace").textContent).toContain("来源不可用");
  });

  it("溯源失败时把原因说出来（不静默）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubMemoryPanel({ traceMemorySource: vi.fn(async () => { throw new Error("trace boom"); }) });
    const { loadMemoryManager } = await loadManager();
    await loadMemoryManager();
    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-action="open-detail"]')!.click();
    await flush();

    byId("memory-manager-detail-list").querySelector<HTMLElement>('[data-manager-action="trace"]')!.click();
    await flush();

    expect(byId("memory-manager-trace").textContent).toContain("trace boom");
  });
});

describe("离开面板", () => {
  it("disposeMemoryManager 收起详情、清空勾选与提示", async () => {
    stubMemoryPanel();
    const { loadMemoryManager, disposeMemoryManager, managerState } = await loadManager();
    await loadMemoryManager();

    const box = byId("memory-manager-list").querySelector<HTMLInputElement>('input[data-manager-key="qq:10001"]')!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    byId("memory-manager-list").querySelector<HTMLElement>('[data-manager-action="open-detail"]')!.click();
    await flush();

    disposeMemoryManager();

    expect(managerState.selected.size).toBe(0);
    expect(managerState.selectedOwn.size).toBe(0);
    expect(managerState.selectedMentioned.size).toBe(0);
    expect(managerState.detail).toBeNull();
    expect(byId("memory-manager-detail").classList.contains("is-hidden")).toBe(true);
    expect(byId("memory-manager-list").classList.contains("is-hidden")).toBe(false);
  });
});
