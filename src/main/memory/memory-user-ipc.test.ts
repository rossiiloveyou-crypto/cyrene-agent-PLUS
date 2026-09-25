/**
 * IPC 接线的冒烟测试（P3 §3.16）。
 *
 * 为什么值得单独写一条：**没有任何既有测试 import `memory-user-ipc.ts`**，
 * 而它是在应用启动时被 `default-dependencies.ts` 调用的 —— 模块加载期的一次崩溃
 * （循环依赖 / 顶层读文件抛错 / 通道名写错）会让整个主进程起不来，而 `tsc` 是看不出来的
 * （P0 施工记录里那个 `hadQqToken` TS2304 就是同一类问题的前身）。
 *
 * 本文件把 `ipcMain` 换成一个记录器，真的把 handler 注册一遍，并逐个 invoke：
 * 断言 ①6 条新通道都注册上了、②参数解析与拒绝路径正确、③转发到主进程数据层。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir,
    relaunch: () => undefined,
    quit: () => undefined,
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
}));

import { IPC } from "../../shared/ipc-channels";
import { createIpcScope, type IpcScopeMainLike } from "../application/ipc-scope";
import { registerMemoryUserToolIpc } from "./memory-user-ipc";

/** 一个最小的 ipcMain 替身：只记录 handler，够 `createIpcScope` 与 invoke 用。 */
function createIpcMainRecorder(): IpcScopeMainLike & {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  channels: () => string[];
} {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  return {
    handle(channel, listener) {
      handlers.set(channel, listener);
      return undefined;
    },
    removeHandler(channel) {
      handlers.delete(channel);
      return undefined;
    },
    on() {
      return undefined;
    },
    removeListener() {
      return undefined;
    },
    channels: () => [...handlers.keys()],
    invoke(channel, payload) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`未注册的通道：${channel}`);
      // ipcMain.handle 的 listener 第一个参数是 IpcMainInvokeEvent；解析层不读它。
      return Promise.resolve(handler({}, payload) as Promise<unknown>);
    },
  };
}

const P3_CHANNELS = [
  IPC.MEMORY_MANAGER_LIST,
  IPC.MEMORY_MANAGER_QUERY,
  IPC.MEMORY_MANAGER_DELETE,
  IPC.MEMORY_ERASE_PREVIEW,
  IPC.MEMORY_ERASE_PERSON,
  IPC.MEMORY_TRACE_SOURCE,
];

describe("registerMemoryUserToolIpc —— P3 六条记忆管理通道", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-ipc-"));
    vi.resetModules();
  });

  it("模块可加载、六条通道全部注册上（启动期不崩）", () => {
    const recorder = createIpcMainRecorder();
    registerMemoryUserToolIpc({
      windowManager: null,
      embeddingIndexService: { invalidateStickerEmbeddingIndex: () => undefined, refreshStickerEmbeddingIndex: () => undefined } as never,
      ipc: createIpcScope(recorder),
    });

    const channels = recorder.channels();
    for (const channel of P3_CHANNELS) {
      expect(channels, `${channel} 未注册`).toContain(channel);
    }
    // 既有通道没被挤掉
    expect(channels).toContain(IPC.MEMORY_DELETE_ALL);
    expect(channels).toContain(IPC.MEMORY_PANEL_GET_DATA);
  });

  it("list / query：非法 view 回落到「按人」，不会抛错", async () => {
    const recorder = createIpcMainRecorder();
    registerMemoryUserToolIpc({
      windowManager: null,
      embeddingIndexService: {} as never,
      ipc: createIpcScope(recorder),
    });

    await expect(recorder.invoke(IPC.MEMORY_MANAGER_LIST, { view: "不存在的视图" })).resolves.toEqual({ items: [] });
    await expect(recorder.invoke(IPC.MEMORY_MANAGER_QUERY, { view: undefined, key: "qq:1" })).resolves.toMatchObject({
      meta: { personKey: "qq:1" },
    });
  });

  it("delete：空 ids + 没有容器 → 全 0，不落盘", async () => {
    const recorder = createIpcMainRecorder();
    registerMemoryUserToolIpc({
      windowManager: null,
      embeddingIndexService: {} as never,
      ipc: createIpcScope(recorder),
    });

    const result = await recorder.invoke(IPC.MEMORY_MANAGER_DELETE, { ids: [1, "", null] });
    expect(result).toEqual({
      requested: 0, removed: 0, evidence: 0, dmaeStates: 0,
      conflictLogs: 0, danglingRefsFixed: 0, reflectionLogs: 0, summariesRemoved: 0,
      // 空入参不做任何事，自然也不碰向量库（§5.2 第 2 步抓到的 D1 修复后新增的字段）
      vectors: 0,
    });
  });

  it("erase-preview：缺少 personKey 直接抛错（UI 必须能区分「预演失败」与「没有可删的东西」）", async () => {
    const recorder = createIpcMainRecorder();
    registerMemoryUserToolIpc({
      windowManager: null,
      embeddingIndexService: {} as never,
      ipc: createIpcScope(recorder),
    });

    await expect(recorder.invoke(IPC.MEMORY_ERASE_PREVIEW, {})).rejects.toThrow("缺少 personKey");
    await expect(recorder.invoke(IPC.MEMORY_ERASE_PREVIEW, { personKey: "no-colon" })).rejects.toThrow();
  });

  it("erase-person：缺少 personKey / previewId 直接抛错", async () => {
    const recorder = createIpcMainRecorder();
    registerMemoryUserToolIpc({
      windowManager: null,
      embeddingIndexService: {} as never,
      ipc: createIpcScope(recorder),
    });

    await expect(recorder.invoke(IPC.MEMORY_ERASE_PERSON, { personKey: "qq:1" })).rejects.toThrow("缺少 personKey 或 previewId");
    await expect(recorder.invoke(IPC.MEMORY_ERASE_PERSON, {})).rejects.toThrow();
  });

  it("trace-source：记忆不存在时返回 missing 而不是抛错", async () => {
    const recorder = createIpcMainRecorder();
    registerMemoryUserToolIpc({
      windowManager: null,
      embeddingIndexService: {} as never,
      ipc: createIpcScope(recorder),
    });

    await expect(recorder.invoke(IPC.MEMORY_TRACE_SOURCE, { memoryId: "l2_not_exist" })).resolves.toEqual({
      entries: [],
      missing: true,
    });
    await expect(recorder.invoke(IPC.MEMORY_TRACE_SOURCE, {})).resolves.toEqual({ entries: [], missing: true });
  });

  it("预演是只读的：内存里没有任何记忆时也返回完整计划（而不是抛错）", async () => {
    const recorder = createIpcMainRecorder();
    registerMemoryUserToolIpc({
      windowManager: null,
      embeddingIndexService: {} as never,
      ipc: createIpcScope(recorder),
    });

    const plan = await recorder.invoke(IPC.MEMORY_ERASE_PREVIEW, { personKey: "qq:10001" }) as Record<string, any>;
    expect(plan.personKey).toBe("qq:10001");
    expect(plan.channel).toBe("qq");
    expect(plan.senderId).toBe("10001");
    expect(plan.l2.total).toBe(0);
    expect(plan.previewId).toMatch(/^erase_/);
    // 报告里必然带上的"整份销毁"两项
    expect(plan.memoryBackups).toEqual({ files: 0, bytes: 0 });
    expect(plan.apiLog).toEqual({ exists: false, bytes: 0 });
  });
});
