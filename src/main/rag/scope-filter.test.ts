// 向量召回的记忆域过滤：群聊历史/记忆不能串到桌面，反之亦然。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { EmbeddingProvider } from "./embedding";

const provider: EmbeddingProvider = {
  name: "deterministic",
  dims: 2,
  async embed(text: string): Promise<number[]> {
    return text.includes("group") ? [0, 1] : [1, 0];
  },
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  },
};

const { userDataDir, appPath } = vi.hoisted(() => ({ userDataDir: { value: "" }, appPath: { value: "" } }));

vi.mock("electron", () => ({
  app: {
    getPath: () => userDataDir.value,
    getAppPath: () => appPath.value,
  },
}));

vi.mock("./embedding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./embedding")>()),
  getEmbeddingProvider: () => provider,
}));

import { addL2MemoryVector, addMemory, initRAG, resetRAG, searchHistoryEntries, searchMemoryEntries } from "./index";

const ROOT_SCOPE = "zone:root";
const SOLO_SCOPE = "solo:channel:qq:group1";

let tmpDir = "";

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-scope-test-"));
  userDataDir.value = tmpDir;
  appPath.value = tmpDir;
  await initRAG();
});

afterEach(() => {
  resetRAG();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 写一条「可召回」的 L2 + 对应向量，返回 ragId。 */
async function seedMemory(content: string, scope: string): Promise<{ l2Id: string; ragId: string }> {
  const { memoryStore } = await import("../memory/memory-store");
  const memory = await memoryStore.addL2Memory({
    content,
    triggerText: content,
    sourceConversationId: "test",
    isPinned: false,
    syncStatus: "pending_sync",
    scope,
  });
  const ragId = await addL2MemoryVector(content, memory.id, { triggerText: content }, scope);
  await memoryStore.markL2SyncStatus(memory.id, "synced", ragId);
  return { l2Id: memory.id, ragId };
}

describe("searchMemoryEntries scope filtering", () => {
  it("returns only memories of the requested scope", async () => {
    const desktop = await seedMemory("desktop alpha memory", ROOT_SCOPE);
    const group = await seedMemory("group alpha memory", SOLO_SCOPE);

    const scopedToRoot = await searchMemoryEntries("alpha memory", "user_memory", 5, { scopeId: ROOT_SCOPE });
    expect(scopedToRoot.map((entry) => entry.id)).toEqual([desktop.ragId]);

    const scopedToGroup = await searchMemoryEntries("alpha memory", "user_memory", 5, { scopeId: SOLO_SCOPE });
    expect(scopedToGroup.map((entry) => entry.id)).toEqual([group.ragId]);
  });

  it("falls back to the whole store when no scope is given", async () => {
    await seedMemory("desktop alpha memory", ROOT_SCOPE);
    await seedMemory("group alpha memory", SOLO_SCOPE);

    const all = await searchMemoryEntries("alpha memory", "user_memory", 5);
    expect(all).toHaveLength(2);
  });

  it("excludes legacy memories without a scope when a scope is requested", async () => {
    const legacy = await seedMemory("legacy alpha memory", "");
    const scoped = await searchMemoryEntries("alpha memory", "user_memory", 5, { scopeId: ROOT_SCOPE });
    expect(scoped.some((entry) => entry.id === legacy.ragId)).toBe(false);
  });
});

describe("searchHistoryEntries scope filtering", () => {
  it("keeps chat history separated by scope", async () => {
    await addMemory("desktop alpha transcript", "chat_history", { sessionId: "desktop", role: "user", scope: ROOT_SCOPE });
    await addMemory("group alpha transcript", "chat_history", { sessionId: "qq-group", role: "user", scope: SOLO_SCOPE });

    const rootHits = await searchHistoryEntries("alpha transcript", 5, ROOT_SCOPE);
    expect(rootHits).toHaveLength(1);
    expect(rootHits[0].text).toBe("desktop alpha transcript");
    expect(rootHits[0].metadata?.scope).toBe(ROOT_SCOPE);

    const groupHits = await searchHistoryEntries("alpha transcript", 5, SOLO_SCOPE);
    expect(groupHits.map((hit) => hit.text)).toEqual(["group alpha transcript"]);
    expect(groupHits.some((hit) => hit.text.includes("desktop"))).toBe(false);
  });

  it("returns nothing for a scope that has no history", async () => {
    await addMemory("desktop alpha transcript", "chat_history", { sessionId: "desktop", role: "user", scope: ROOT_SCOPE });
    expect(await searchHistoryEntries("alpha transcript", 5, "solo:channel:qq:other")).toEqual([]);
  });

  it("keeps the unscoped path unrestricted for legacy callers", async () => {
    await addMemory("desktop alpha transcript", "chat_history", { sessionId: "desktop", role: "user", scope: ROOT_SCOPE });
    await addMemory("group alpha transcript", "chat_history", { sessionId: "qq-group", role: "user", scope: SOLO_SCOPE });
    expect(await searchHistoryEntries("alpha transcript", 5)).toHaveLength(2);
  });
});
