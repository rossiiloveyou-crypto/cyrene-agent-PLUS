// @vitest-environment jsdom
//
// 「彻底擦除」三段式流程的 jsdom 用例（P3 §3.20 / §4.6）。
//
// 这一段是整套 UI 里最危险的动作，所以用例的重点全在**门控**上：
// - 预演失败 / previewId 缺失 / 用户取消 / 确认短语不严格相等 → 绝不调用 erasePerson；
// - 预演弹窗必须同时有「将删除 N 条」与「保留 M 条：别人提到他」两行，以及语料与备份的说明；
// - 报告不吞 failed[]；
// - needsReconfirm 时回到 ①（重新预演），并且**不弹重启提示**（§3.16）。

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

const PLAN = {
  personKey: "qq:10001", channel: "qq", senderId: "10001", knownNames: ["小明"],
  sessions: [
    { sessionId: "channel:qq:aaaa", kind: "private", l2Count: 4, hotLines: 12, archiveLines: 30, archiveMonths: 2, assistantLines: 0 },
    { sessionId: "channel:qq:bbbb", kind: "group", l2Count: 1, hotLines: 3, archiveLines: 0, archiveMonths: 0, assistantLines: 2 },
  ],
  l2: {
    total: 4, byRule: { private: 3, speaker: 1 }, ids: ["m-1", "m-2", "m-3", "m-4"], keptSubjectOnly: 8,
    keptSamples: [
      { content: "小明最近在学 Rust", speakerIds: ["qq:10002"] },
      { content: "我和小明去看漫展", speakerIds: ["qq:10002"] },
      { content: "小明说他换工作了", speakerIds: ["qq:10003"] },
      { content: "第四条样本不该出现在弹窗里", speakerIds: ["qq:10004"] },
    ],
  },
  summaries: { decompress: ["s-1"], remove: ["s-2"] },
  vectors: 4, evidence: 6, dmaeStates: 4, conflictLogs: 1, reflectionLogs: 2,
  // D2：对话的向量副本单独计数 —— 它过去完全不在弹窗里，用户看不到这条通道
  chatHistoryVectors: 7,
  entities: [{ name: "小明", scope: "zone_x", relations: 3 }],
  relationshipEntries: { byPersonKey: 2, byScope: 1, byTextFingerprint: 3, unmatched: 1, summaries: 1 },
  audit: { entries: 5, files: 2 },
  channelLogLines: 7,
  externalChats: 1,
  // D4：agent 运行记录（`cyrene-runs/sessions/*.json` 里是逐字对话正文）
  runs: 3,
  memoryBackups: { files: 3, bytes: 2048 },
  apiLog: { exists: true, bytes: 1048576 },
  residues: [
    { kind: "l0", file: "memory.json", snippet: "小明" },
    { kind: "entityDerived", file: "entity-graph.json", snippet: "「Rust」（concept，提及 3 次）出现在他的记忆里" },
  ],
  // O2：由主进程给出的「有意保留」清单（UI 不硬编码）
  preservedPaths: ["cyrene-chats/", "channels-settings.json", "zones.json", "cyrene-runs/reviews/", "cyrene-runs/tool-results/"],
  warnings: ["1 个 transcript 文件无法识别来源"],
  previewId: "pv-1",
};

const REPORT = {
  personKey: "qq:10001", partial: true, needsReconfirm: false, addedSincePreview: 0,
  l2: { requested: 4, removed: 4, summariesRemoved: 2, decompressed: 1 },
  transcript: { sessions: 2, hotLines: 12, archiveLines: 30, assistantLines: 2 },
  chatHistoryVectors: 7,
  audit: { entries: 5, files: 2 },
  channelLog: { lines: 7 },
  externalChats: 1,
  runs: 3,
  backups: { files: 3, bytes: 2048 },
  apiLog: { deleted: true, bytes: 1048576 },
  entities: { nodes: 1, relations: 3 },
  relationship: { byPersonKey: 2, byScope: 1, byTextFingerprint: 3, summaries: 1 },
  caches: { injections: 2, sessionIndex: 1, dmaeReloaded: true },
  obsidian: { synced: false },
  keptSubjectOnly: 8,
  residues: [{ kind: "assistantText", file: "channel_qq_bbbb.jsonl", snippet: "小明你真厉害" }],
  failed: [{ step: "transcript", target: "channel:qq:aaaa", error: "EBUSY" }],
};

const ITEMS = [
  { key: "qq:10001", label: "小明", sublabel: "10001", total: 12, own: 4, mentioned: 8, sessions: 2, erasable: true },
];

function stubMemoryPanel(overrides: Record<string, unknown> = {}) {
  const api = {
    listMemoryManager: vi.fn(async () => ({ items: ITEMS })),
    queryMemoryManager: vi.fn(async () => ({
      memories: [{
        id: "m-1", content: "我最近在学 Rust", triggerText: "我最近在学 Rust", createdAt: 1737000000000,
        status: "active", sourceConversationId: "channel:qq:aaaa", speakerIds: ["qq:10001"],
      }],
      meta: { total: 1, own: 1, mentioned: 0, personKey: "qq:10001", sessions: [] },
    })),
    deleteMemoryManager: vi.fn(async () => ({ requested: 0, removed: 0, evidence: 0, dmaeStates: 0, conflictLogs: 0, danglingRefsFixed: 0, reflectionLogs: 0, summariesRemoved: 0, vectors: 0 })),
    traceMemorySource: vi.fn(async () => ({ entries: [], missing: false })),
    erasePreview: vi.fn(async () => ({ ...PLAN })),
    erasePerson: vi.fn(async () => ({ ...REPORT })),
    restartApp: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
  Object.assign(window, { memoryPanel: api });
  return api;
}

async function loadFlow() {
  vi.resetModules();
  return await import("./erasure-flow");
}

function confirmHtmlModal(): void {
  (document.getElementById("cy-html-modal-confirm") as HTMLButtonElement).click();
}

function confirmInputModal(): void {
  (document.getElementById("cy-input-confirm") as HTMLButtonElement).click();
}

function cancelInputModal(): void {
  (document.getElementById("cy-input-cancel") as HTMLButtonElement).click();
}

function typePhrase(value: string): void {
  const input = document.getElementById("cy-input-field") as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function htmlModalBody(): string {
  return document.getElementById("cy-html-modal-body")?.innerHTML ?? "";
}

function htmlModalTitle(): string {
  return document.getElementById("cy-html-modal-title")?.textContent ?? "";
}

function inputModalTitle(): string {
  return document.getElementById("cy-input-title")?.textContent ?? "";
}

/** 走完「预览弹窗 → 输入框填短语 → 确认」这一段。 */
async function passPreviewAndConfirm(phrase = "彻底擦除"): Promise<void> {
  await flush();
  confirmHtmlModal();
  await flush();
  typePhrase(phrase);
  confirmInputModal();
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = memoryPanelMarkup();
  vi.restoreAllMocks();
});

describe("确认短语与 personKey 门控", () => {
  it("默认短语是「彻底擦除」，严格相等才算确认", async () => {
    const mod = await loadFlow();
    expect(mod.eraseConfirmPhrase()).toBe("彻底擦除");
    expect(mod.isEraseConfirmed("彻底擦除")).toBe(true);
    expect(mod.isEraseConfirmed("彻底擦除 ")).toBe(false);
    expect(mod.isEraseConfirmed(" 彻底擦除")).toBe(false);
    expect(mod.isEraseConfirmed("擦除")).toBe(false);
    expect(mod.isEraseConfirmed("彻底擦除！")).toBe(false);
    expect(mod.isEraseConfirmed("")).toBe(false);
  });

  it("只有合法的 personKey 才允许彻底擦除", async () => {
    const mod = await loadFlow();
    expect(mod.canErasePersonKey("qq:10001")).toBe(true);
    expect(mod.canErasePersonKey("my_channel:ou_xxx")).toBe(true);
    expect(mod.canErasePersonKey("__unattributed__")).toBe(false);
    expect(mod.canErasePersonKey("qq10001")).toBe(false);
    expect(mod.canErasePersonKey("")).toBe(false);
  });

  it("无归属的 key 直接返回：连预演都不发", async () => {
    const api = stubMemoryPanel();
    const mod = await loadFlow();
    await mod.runPersonEraseFlow("__unattributed__");
    expect(api.erasePreview).not.toHaveBeenCalled();
    expect(document.getElementById("cy-html-modal-overlay")).toBeNull();
  });

  it("formatBytes：0 / KB / MB", async () => {
    const mod = await loadFlow();
    expect(mod.formatBytes(0)).toBe("0 B");
    expect(mod.formatBytes(512)).toBe("512 B");
    expect(mod.formatBytes(2048)).toBe("2.0 KB");
    expect(mod.formatBytes(1048576)).toBe("1.0 MB");
  });
});

describe("预演弹窗正文", () => {
  it("「将删除」与「保留」是两行，样本最多 3 条", async () => {
    const mod = await loadFlow();
    const body = mod.buildErasePlanBody({ ...PLAN } as never);

    // ① 与 ② 各自是一个独立段落（验收 §5.2 第 4 步要求）
    expect(body).toContain("将删除 4 条（他说的 / 他的私聊）</p>");
    expect(body).toContain("保留 8 条：别人提到他</p>");
    expect(body).toContain("小明最近在学 Rust");
    expect(body).toContain("我和小明去看漫展");
    expect(body).toContain("小明说他换工作了");
    // 第 4 条样本必须被截掉，但要说明还有多少条
    expect(body).not.toContain("第四条样本不该出现在弹窗里");
    expect(body).toContain("另有 1 条未列出");
  });

  it("明说群聊语料未做任何改动", async () => {
    const mod = await loadFlow();
    const body = mod.buildErasePlanBody({ ...PLAN } as never);
    expect(body).toContain("群聊语料未做任何改动");
  });

  it("显式列出备份与调试日志的大小（整份销毁）", async () => {
    const mod = await loadFlow();
    const body = mod.buildErasePlanBody({ ...PLAN } as never);
    expect(body).toContain("记忆备份 + 对账备份：3 个文件 · 2.0 KB");
    expect(body).toContain("API 调试日志（chat-api.log）：1.0 MB");
    expect(body).toContain("整份销毁");
  });

  it("列出来源会话、外围载体、关系日志四档、实体候选、残留与警告", async () => {
    const mod = await loadFlow();
    const body = mod.buildErasePlanBody({ ...PLAN } as never);
    expect(body).toContain("channel:qq:aaaa");
    expect(body).toContain("channel:qq:bbbb");
    expect(body).toContain("按人 2 · 按域 1 · 原文指纹 3 · 无法定位 1");
    expect(body).toContain("小明（zone_x）· 关联关系 3 条");
    expect(body).toContain("L0 画像 · memory.json");
    expect(body).toContain("1 个 transcript 文件无法识别来源");
  });

  it("apiLog 不存在时说「不存在」，不说 0 B", async () => {
    const mod = await loadFlow();
    const body = mod.buildErasePlanBody({ ...PLAN, apiLog: { exists: false, bytes: 0 } } as never);
    expect(body).toContain("不存在");
  });

  // D5 / D2：这两条残留通道必须**在弹窗里看得见**，否则用户无从核对
  it("D5 + D2：弹窗列出「她提及他的回复行数」与「对话向量条数」", async () => {
    const mod = await loadFlow();
    const body = mod.buildErasePlanBody({ ...PLAN } as never);
    expect(body).toContain("其中她提及他的回复 2 行");
    expect(body).toContain("记忆向量 4 · 对话向量 7");
  });

  // D6：这一格过去只有执行报告里有，预演算不出来 → 用户会看到"预演没有、报告有 1"
  it("D6：弹窗的「关系日志」行也带「连带删除的日摘要」", async () => {
    const mod = await loadFlow();
    const body = mod.buildErasePlanBody({ ...PLAN } as never);
    expect(body).toContain("按人 2 · 按域 1 · 原文指纹 3 · 无法定位 1 · 连带删除的日摘要 1");
  });

  // D4：运行记录里是逐字对话正文，必须让用户在弹窗里看见"会删几个 run"
  it("D4：弹窗与报告都列出「agent 运行记录 N 个」", async () => {
    const mod = await loadFlow();
    expect(mod.buildErasePlanBody({ ...PLAN } as never)).toContain("agent 运行记录 3 个");
    expect(mod.buildEraseReportBody({ ...REPORT } as never)).toContain("agent 运行记录 3 个");
  });

  // O2：文案不许超出证据 —— 弹窗必须把"有意保留"的载体也列出来，而不是只说"全部痕迹"
  it("O2：弹窗列出「有意保留」的载体（含桌面对话与访问控制配置）", async () => {
    const mod = await loadFlow();
    const body = mod.buildErasePlanBody({ ...PLAN } as never);
    expect(body).toContain("有意保留（擦除不会动它们");
    expect(body).toContain("桌面对话");
    expect(body).toContain("访问控制配置");
    expect(body).toContain("运行评审");
    // O3：实体图派生物这一档要有可读标签
    expect(body).toContain("实体图里的派生节点");
  });
});

describe("擦除报告正文", () => {
  it("不吞 failed[]：步骤 / 目标 / 原因逐条列出", async () => {
    const mod = await loadFlow();
    const body = mod.buildEraseReportBody({ ...REPORT } as never);
    expect(body).toContain("部分完成");
    expect(body).toContain("失败步骤（1）");
    expect(body).toContain("transcript · channel:qq:aaaa —— EBUSY");
  });

  it("各类计数与保留条数都在", async () => {
    const mod = await loadFlow();
    const body = mod.buildEraseReportBody({ ...REPORT } as never);
    expect(body).toContain("请求删除 4 条 · 实际删除 4 条");
    expect(body).toContain("保留（别人提到他）：8 条");
    expect(body).toContain("已整份删除");
    expect(body).toContain("未绑定 vault，跳过");
    expect(body).toContain("小明你真厉害");
    // D5 / D2：执行报告里也要能读到这两条通道清了多少
    expect(body).toContain("其中她提及他的回复 2 行");
    expect(body).toContain("记忆向量 4 条 · 对话向量 7 条");
  });

  it("没有失败步骤时用「已完成」，不出现失败段落", async () => {
    const mod = await loadFlow();
    const body = mod.buildEraseReportBody({ ...REPORT, partial: false, failed: [] } as never);
    expect(body).toContain("已完成，没有失败步骤");
    expect(body).not.toContain("失败步骤（");
  });
});

describe("三段式流程", () => {
  it("预演失败 → 提示并中止（不进入确认、不调用 erasePerson）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const api = stubMemoryPanel({ erasePreview: vi.fn(async () => { throw new Error("preview boom"); }) });
    const mod = await loadFlow();
    const flow = mod.runPersonEraseFlow("qq:10001");
    await flush();

    expect(htmlModalTitle()).toContain("预演失败");
    expect(htmlModalBody()).toContain("preview boom");
    confirmHtmlModal();
    await flow;

    expect(api.erasePerson).not.toHaveBeenCalled();
    // 输入框从未出现
    expect(document.getElementById("cy-input-overlay")).toBeNull();
  });

  it("预演没有 previewId 时绝不执行", async () => {
    const api = stubMemoryPanel({ erasePreview: vi.fn(async () => ({ ...PLAN, previewId: "" })) });
    const mod = await loadFlow();
    const flow = mod.runPersonEraseFlow("qq:10001");
    await passPreviewAndConfirm();
    await flow;

    expect(api.erasePerson).not.toHaveBeenCalled();
  });

  it("取消二次确认 → 不调用 erasePerson", async () => {
    const api = stubMemoryPanel();
    const mod = await loadFlow();
    const flow = mod.runPersonEraseFlow("qq:10001");
    await flush();
    confirmHtmlModal();
    await flush();
    cancelInputModal();
    await flow;

    expect(api.erasePerson).not.toHaveBeenCalled();
  });

  it("确认短语不严格相等时确认按钮不可点，回车也不提交", async () => {
    const api = stubMemoryPanel();
    const mod = await loadFlow();
    const flow = mod.runPersonEraseFlow("qq:10001");
    await flush();
    confirmHtmlModal();
    await flush();

    typePhrase("彻底擦除 ");
    const confirm = document.getElementById("cy-input-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    (document.getElementById("cy-input-field") as HTMLInputElement)
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(api.erasePerson).not.toHaveBeenCalled();

    typePhrase("彻底擦除");
    expect(confirm.disabled).toBe(false);
    confirmInputModal();
    await flush();
    expect(api.erasePerson).toHaveBeenCalledWith("qq:10001", "pv-1");
    // 报告弹窗走完才结束
    confirmHtmlModal();
    await flow;
  });

  it("完整走通：预览 → 确认 → 执行 → 报告 → 刷新列表（不弹重启）", async () => {
    const api = stubMemoryPanel();
    const mod = await loadFlow();
    const flow = mod.runPersonEraseFlow("qq:10001");

    await flush();
    // ① 预览弹窗：分类计数 + 保留清单 + 语料说明
    expect(htmlModalTitle()).toContain("擦除预演");
    expect(htmlModalBody()).toContain("将删除 4 条（他说的 / 他的私聊）");
    expect(htmlModalBody()).toContain("保留 8 条：别人提到他");
    expect(htmlModalBody()).toContain("群聊语料未做任何改动");

    confirmHtmlModal();
    await flush();
    // ② 二次确认（输入弹窗是另一套 overlay）
    expect(inputModalTitle()).toContain("二次确认");
    typePhrase("彻底擦除");
    confirmInputModal();
    await flush();

    // ③ 执行 + 报告
    expect(api.erasePerson).toHaveBeenCalledWith("qq:10001", "pv-1");
    expect(htmlModalTitle()).toContain("擦除完成");
    expect(htmlModalBody()).toContain("transcript · channel:qq:aaaa —— EBUSY");
    // 不弹重启（§3.16：擦除原地失效缓存）
    expect(api.restartApp).not.toHaveBeenCalled();
    expect(document.getElementById("cy-modal-overlay")).toBeNull();
    expect(htmlModalBody()).not.toContain("重启");

    confirmHtmlModal();
    await flow;
    // 列已刷新
    expect(api.listMemoryManager).toHaveBeenCalled();
  });

  it("needsReconfirm → 提示并回到 ① 重新预演", async () => {
    const erasePreview = vi.fn(async () => ({ ...PLAN }));
    const erasePerson = vi.fn()
      .mockResolvedValueOnce({ ...REPORT, needsReconfirm: true, addedSincePreview: 3, partial: false })
      .mockResolvedValueOnce({ ...REPORT });
    const api = stubMemoryPanel({ erasePreview, erasePerson });
    const mod = await loadFlow();
    const flow = mod.runPersonEraseFlow("qq:10001");

    await passPreviewAndConfirm();
    // 一致性校验失败：提示重新预演
    expect(htmlModalTitle()).toContain("需要重新预演");
    expect(htmlModalBody()).toContain("3 条");
    expect(api.erasePerson).toHaveBeenCalledTimes(1);

    // 回到 ①：又出现一次预演弹窗
    confirmHtmlModal();
    await passPreviewAndConfirm();
    expect(api.erasePreview).toHaveBeenCalledTimes(2);
    expect(api.erasePerson).toHaveBeenCalledTimes(2);
    expect(htmlModalTitle()).toContain("擦除完成");

    confirmHtmlModal();
    await flow;
  });

  it("连续多轮都需要重新预演时中止（不无限循环）", async () => {
    const erasePreview = vi.fn(async () => ({ ...PLAN }));
    const erasePerson = vi.fn(async () => ({ ...REPORT, needsReconfirm: true, addedSincePreview: 1, partial: false }));
    const api = stubMemoryPanel({ erasePreview, erasePerson });
    const mod = await loadFlow();
    const flow = mod.runPersonEraseFlow("qq:10001");

    for (let round = 0; round < 3; round += 1) {
      await passPreviewAndConfirm();
      // 每一轮都要把「需要重新预演」（最后一轮是中止提示）弹窗关掉
      confirmHtmlModal();
      await flush();
    }
    await flow;

    expect(api.erasePreview).toHaveBeenCalledTimes(3);
    expect(api.erasePerson).toHaveBeenCalledTimes(3);
    expect(htmlModalTitle()).toContain("需要重新预演");
    expect(htmlModalBody()).toContain("连续多轮");
    // 中止后仍然刷新了列表，用户可以看到当前状态
    expect(api.listMemoryManager).toHaveBeenCalled();
  });

  it("执行抛错时给出失败提示（不静默、不弹报告）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const api = stubMemoryPanel({ erasePerson: vi.fn(async () => { throw new Error("erase boom"); }) });
    const mod = await loadFlow();
    const flow = mod.runPersonEraseFlow("qq:10001");

    await passPreviewAndConfirm();
    expect(htmlModalTitle()).toContain("擦除失败");
    expect(htmlModalBody()).toContain("erase boom");
    confirmHtmlModal();
    await flow;
    expect(api.listMemoryManager).not.toHaveBeenCalled();
  });
});

describe("initMemoryManagerUI", () => {
  it("绑定详情区的「彻底擦除」按钮，并只对 erasable 的人生效", async () => {
    const api = stubMemoryPanel();
    const mod = await loadFlow();
    const manager = await import("./manager");
    mod.initMemoryManagerUI();
    await manager.loadMemoryManager();

    // 进详情
    document.getElementById("memory-manager-list")!
      .querySelector<HTMLElement>('[data-manager-action="open-detail"]')!.click();
    await flush();

    document.getElementById("memory-manager-erase-btn")!.click();
    await flush();
    expect(api.erasePreview).toHaveBeenCalledWith("qq:10001");
    expect(htmlModalTitle()).toContain("擦除预演");
  });
});
