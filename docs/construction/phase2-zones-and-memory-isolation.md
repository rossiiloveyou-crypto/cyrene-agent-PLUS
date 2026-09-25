# Phase 2 施工蓝图：区块系统与记忆隔离

> **前置阅读**：`docs/construction/phase1-group-context-observe.md`（已完成）
> **本阶段目标**：把"记忆域"从代码里的隐式全局概念，升级为**用户可配置的一等对象「区块」**，实现记忆不串味；同时把群白名单并入区块管理，并在设置里提供群上下文条数与"删除全部记忆"。

---

## 0. 背景

### 0.1 Phase 1 之后的状态

Phase 1 解决了「群内上下文」问题，但**记忆仍然是全局共享的**：

| 存储 | Phase 1 后状态 |
|---|---|
| `memory.json` L0/L1 | 全局，每轮无条件注入（**群里也注入**） |
| `memory.json` L2 | 全局，无 scope 标签 |
| `rag-data/memory-store.json` | 全局；`chat_history` 无过滤，`recall_history` 可跨渠道召回 |
| `relationship-log.json` | 全局，每轮注入【近期关系线索】 |
| `entity-graph.json` | 全局 |
| `channels/history/*.jsonl` | ✅ 已按 sessionId 天然隔离（Phase 1.5 后带说话人） |
| `channels/archive/**` | ✅ 同上，按会话×月隔离（Phase 1.5 T7 引入，不参与 prompt） |
| `moments.json` / `chat-social-atoms.json` | 全局 |

**后果**：QQ 群 A 的记忆会出现在群 B；群里的陌生人发言会被写成"用户的事实"；你的私人画像（含明文密码）会进群上下文。

### 0.2 本阶段要建立的心智模型

```
区块（Zone）= 一个记忆域
  ├─ root 区块（唯一、不可删）
  │    ├─ 所有桌面对话（隐式成员，自动包含）
  │    └─ 最多 1 个 QQ 私聊（↔ 桌面双向镜像消息）
  └─ 自定义区块（0..N 个）
       └─ 只能包含外部会话（QQ 群 / QQ 私聊 / 其他渠道）

未加入任何区块的外部会话 = 独立域（standalone）
```

**核心不变量**：
1. 一个外部会话（或桌面对话）**同一时刻只属于一个区块**
2. 记忆写入时打上「当前域」标签；读取时**只读当前域**
3. 群白名单被区块成员关系取代：**加入区块 = 加入白名单**
4. 群上下文条数可配置（设置-记忆）
5. 旧记忆**一次性清空**（本分支为个人开发分支，无兼容包袱）

---

## 1. 术语与类型定义

### 1.1 新增：`src/main/zones/types.ts`

```ts
/** 区块成员类型。desktop 只属于 root；其余为外部渠道会话。 */
export type ZoneMemberKind = "desktop" | "external";

export interface ZoneDesktopMember {
  kind: "desktop";
  /** 桌面对话 ID（cyrene-chats/sessions/<id>.json） */
  conversationId: string;
}

export interface ZoneExternalMember {
  kind: "external";
  /** 渠道会话 ID：与 channels/history/*.jsonl 文件键一致（channel:<channel>:<hash16>） */
  sessionId: string;
  /** 渠道 id（qq / wechat / feishu / qqbot / 插件动态渠道） */
  channel: string;
  /** 平台会话 id（群号 / 私聊对端 id）。仅用于展示。 */
  chatId: string;
  chatType: "private" | "group";
  /** 展示名（群名 / 昵称），可缺失 */
  senderName?: string;
}

export type ZoneMember = ZoneDesktopMember | ZoneExternalMember;

export interface ZoneConfig {
  /** 群消息旁听：白名单群内未 @ 的消息也写入 transcript 供上下文理解。默认 true。 */
  observeGroupMessages: boolean;
  /** 是否在本区块注入 owner 的 L0/L1 画像。群聊默认 false（隐私）。 */
  injectOwnerProfile: boolean;
}

export interface Zone {
  /** "root" 或 "zone_<timestamp>_<rand6>" */
  zoneId: string;
  /** 展示名。root 固定为 "desktop" */
  zoneName: string;
  /** root 区块：不可删除；自动包含全部桌面对话 */
  isRoot: boolean;
  createdAt: number;
  members: ZoneMember[];
  config: ZoneConfig;
}

export interface ZoneStoreData {
  version: 1;
  zones: Zone[];
}
```

### 1.2 新增：记忆域标识 `MemoryScopeId`

**不做复杂对象，用字符串**（便于持久化进各存储、便于比较、便于日志）：

```ts
/**
 * 记忆域标识。
 * - "zone:root"                    root 区块
 * - "zone:<zoneId>"                自定义区块
 * - "solo:<sessionId>"             未加入任何区块的外部会话（独立域）
 */
export type MemoryScopeId = string;

export function zoneScope(zoneId: string): MemoryScopeId {
  return `zone:${zoneId}`;
}

export function soloScope(sessionId: string): MemoryScopeId {
  return `solo:${sessionId}`;
}
```

> **为什么不用对象**：`memory.json` / 向量 metadata / 关系日志都要存它，字符串最省事；且 `MemoryScopeId` 直接可比较，过滤逻辑是一行 `===`。

### 1.3 扩展：`L2Memory` 加 `scope`

**文件**：`src/main/memory/memory-types.ts`

```ts
export interface L2Memory {
  // ...原有字段保持不变
  /**
   * 记忆所属域。Phase 2 新增。
   * 缺失（= undefined）视为 legacy，读取时按"不可召回"处理（Phase 2 会清空旧数据，
   * 正常不会出现；仅作为防御）。
   */
  scope?: MemoryScopeId
}
```

`MemoryStore` 增加顶层版本常量：

```ts
export const CURRENT_MEMORY_SCHEMA_VERSION = 3   // 原为 2，在 memory-store-defaults.ts 中
```

---

## 2. 施工任务总览

| 编号 | 任务 | 主要文件 | 依赖 |
|---|---|---|---|
| **A** | Schema v2→v3 升级 + 启动自动清空弹窗 | `memory-schema-gate.ts`(新)、`default-dependencies.ts` | 无 |
| **B** | Zone Store（区块存储） | `zones/zone-store.ts`(新)、`zones/types.ts`(新) | 无 |
| **C** | Scope 解析器 | `zones/scope.ts`(新) | B |
| **D** | 记忆写入打 scope | `memory-manager.ts`、`memory-scheduler.ts`、`context-builder.ts` | B,C |
| **E** | 记忆读取按 scope 过滤 | `memory-store.ts`、`orchestrator/index.ts`、`rag/index.ts`、`history-tools.ts`、`relationship-log.ts`、`entity-graph.ts` | D |
| **F** | 群上下文条数设置 | `general-settings.ts`、`orchestrator/index.ts`、memory panel UI | 无 |
| **G** | "删除全部记忆"按钮 + IPC | `memory-deletion.ts`(新)、`memory-user-ipc.ts`、preload | 无 |
| **H** | "记忆区块"UI 面板 | `index.html`、`settings/zones/*`(新) | B |
| **I** | 废弃旧"清空记录" | `index.html`、`settings.ts`、i18n | G |
| **J** | 群白名单并入区块 | `settings-store.ts`、`napcat-adapter.ts`、`qqbot-adapter.ts`、channels UI | B |

---

## 3. 任务 A：Schema 升级与启动自动清空

### 3.1 目标

Phase 2 首次启动时，检测到 `memory.json` 的 `schemaVersion < 3`，弹出**原生对话框**告知用户"记忆格式升级，将清空所有旧记忆"，确认后删除全部记忆文件并写入全新 v3 存储。

### 3.2 新建 `src/main/memory/memory-schema-gate.ts`

```ts
import { dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { deleteAllMemory } from "./memory-deletion";

const CURRENT_SCHEMA = 3;

/** 读取 memory.json 的 schemaVersion；文件不存在或畸形返回 null。 */
function readSchemaVersion(): number | null {
  try {
    const filePath = path.join(app.getPath("userData"), "memory.json");
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { schemaVersion?: unknown };
    return typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 0;
  } catch {
    return 0; // 畸形文件按"需要清空"处理
  }
}

/**
 * 启动期记忆 schema 闸门。必须在任何 memoryStore.load() 之前调用。
 *
 * 返回值：
 *   "ok"       —— 无需处理（文件不存在，或已是当前版本）
 *   "migrated" —— 用户确认，已清空并按 v3 重建
 *   "aborted"  —— 用户选择退出应用，调用方应立即退出进程
 *
 * 注意：本函数是**同步阻塞**的（dialog.showMessageBoxSync），只在启动期调用一次。
 */
export function runMemorySchemaGate(): "ok" | "migrated" | "aborted" {
  const version = readSchemaVersion();
  if (version === null || version >= CURRENT_SCHEMA) return "ok";

  const { response } = dialog.showMessageBoxSync({
    type: "warning",
    title: "记忆格式升级",
    message: "昔涟的记忆格式已升级到「区块」版本",
    detail:
      `检测到旧版记忆（v${version}）。升级后，记忆将按「区块」隔离，` +
      "旧记忆无法自动迁移，将被清空。\n\n" +
      "此操作不可撤销。如需保留，请先关闭本提示并备份 userData 目录。",
    buttons: ["清空记忆并继续", "退出应用"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }) as unknown as number;

  if (response !== 0) return "aborted";

  deleteAllMemory();
  return "migrated";
}
```

> ⚠️ **注意**：`dialog.showMessageBoxSync` 的返回类型在不同 Electron 版本下可能是 `number` 或 `{response:number}`。实现时用 `typeof result === "number" ? result : result.response` 兼容。

### 3.3 接入启动序列

**文件**：`src/main/application/default-dependencies.ts`（或实际的 composition root）

在 `initRAG()` **之前**插入闸门：

```ts
import { runMemorySchemaGate } from "../memory/memory-schema-gate";

// ...装配阶段，进入核心初始化前
const gate = runMemorySchemaGate();
if (gate === "aborted") {
  app.quit();
  return; // 或 throw，确保后续初始化不执行
}
```

**必须早于**：
- `initRAG()`（会 load 向量库）
- 任何 `memoryStore.load()`
- `channels/startChannels()`

### 3.4 测试

**文件**：`src/main/memory/memory-schema-gate.test.ts`（新建）

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mock electron 的 app / dialog
vi.mock("electron", () => ({
  app: { getPath: () => tmpDir, quit: vi.fn() },
  dialog: { showMessageBoxSync: vi.fn() },
}));
vi.mock("./memory-deletion", () => ({ deleteAllMemory: vi.fn() }));

describe("runMemorySchemaGate", () => {
  it("returns ok when memory.json does not exist", () => { /* ... */ });
  it("returns ok when schemaVersion >= 3", () => { /* ... */ });
  it("returns aborted and does not delete when user cancels", () => {
    // dialog 返回 1
    // expect(deleteAllMemory).not.toHaveBeenCalled()
  });
  it("returns migrated and deletes when user confirms", () => {
    // dialog 返回 0
    // expect(deleteAllMemory).toHaveBeenCalledOnce()
  });
  it("treats malformed memory.json as needing migration", () => { /* ... */ });
});
```

---

## 4. 任务 G：`deleteAllMemory()`（先行实现，任务 A 依赖它）

### 4.1 新建 `src/main/memory/memory-deletion.ts`

```ts
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { appendMemoryTrace } from "./memory-trace";

/** 删除全部记忆时清理的路径（相对 userData）。目录用 trailing "/" 标记。 */
const MEMORY_TARGETS = [
  "memory.json",
  "memory-trace.log",
  "relationship-log.json",
  "entity-graph.json",
  "moments.json",
  "chat-social-atoms.json",
  "worldbook-state.json",
  "proactive-state.json",
  "rag-data/memory-store.json",
  "rag-data/memory-store-meta.json",
  "rag-data/document-cache.json",
  "channels/history/",      // 目录：全部会话 transcript（热层）
  "channels/archive/",      // 目录：全部会话按月归档（温层，Phase 1.5 T7 引入）
] as const;

export interface DeleteAllMemoryResult {
  deleted: string[];
  failed: Array<{ path: string; error: string }>;
}

/**
 * 删除全部长期记忆（不动桌面对话 cyrene-chats/、不动配置、不动表情包）。
 *
 * 语义边界（务必与 UI 文案一致）：
 *   删除 = 昔涟"记得的一切"：L0/L1/L2、向量库、关系日志、实体图谱、
 *          朋友圈、社交原子、渠道 transcript（热层）、渠道按月归档（温层）、世界书运行时状态。
 *   保留 = 桌面对话记录、渠道配置、模型配置、表情包、定时任务、插件。
 *
 * 调用方责任：删除后必须让内存缓存失效（重启或显式 reset），
 * 否则 memoryStore / entityGraph 会把缓存里的旧数据写回。
 */
export function deleteAllMemory(): DeleteAllMemoryResult {
  const root = app.getPath("userData");
  const deleted: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  for (const rel of MEMORY_TARGETS) {
    const target = path.join(root, rel);
    try {
      if (rel.endsWith("/")) {
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true });
          deleted.push(rel);
        }
      } else if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
        deleted.push(rel);
      }
    } catch (err) {
      failed.push({ path: rel, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // trace 文件刚被删掉，重新建一条删除审计（appendMemoryTrace 会自动建目录）
  try {
    appendMemoryTrace({
      op: "memory.deleteAll",
      layer: "store",
      status: "ok",
      details: { deleted, failed: failed.map((f) => f.path) },
    });
  } catch { /* 忽略 */ }

  return { deleted, failed };
}
```

> **决策说明**：这里**不删除** `cyrene-chats/`（桌面对话）——这是用户明确要求的边界：新按钮管记忆，桌面对话由聊天窗口的会话删除管理，旧的整体"清空记录"按钮废弃。

### 4.2 内存缓存失效

删除后**必须重启应用**才能生效，因为：
- `memoryStore.cache` 是进程内缓存
- `entityGraph.cache` 是进程内缓存
- `JsonVectorStore.entries` 在 `initRAG()` 时一次性 load 进内存

**两种实现选择**（蓝图推荐 ①）：

① **删除后提示用户重启**（简单、零风险）
```ts
ipc.handle(IPC.MEMORY_DELETE_ALL, () => {
  const result = deleteAllMemory();
  return { ok: result.failed.length === 0, ...result, restartRequired: true };
});
```
UI 收到 `restartRequired: true` 后提示"已删除，请重启昔涟生效"，并提供"立即重启"按钮（调 `app.relaunch()` + `app.quit()`）。

② **删除后原地重置所有缓存**（无重启，但要新增 reset API）
需要新增：`memoryStore.resetCache()`、`entityGraph.reset()`（已存在）、`resetRAG()`（已存在）+ 重新 `initRAG()`。风险更高。

**推荐 ①**，并在 IPC 里额外暴露 `IPC.APP_RESTART`（若不存在）。

---

## 5. 任务 B：Zone Store

### 5.1 新建 `src/main/zones/zone-store.ts`

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import type { Zone, ZoneMember, ZoneStoreData } from "./types";

const STORE_VERSION = 1;
const ROOT_ZONE_ID = "root";

function zonesFilePath(): string {
  return path.join(app.getPath("userData"), "zones.json");
}

function emptyState(): ZoneStoreData {
  return { version: STORE_VERSION, zones: [createRootZone()] };
}

export function createRootZone(): Zone {
  return {
    zoneId: ROOT_ZONE_ID,
    zoneName: "desktop",
    isRoot: true,
    createdAt: Date.now(),
    members: [],
    config: { observeGroupMessages: true, injectOwnerProfile: true },
  };
}

/** 区块名校验：1~64 字符，去掉首尾空白。 */
function normalizeZoneName(input: unknown, fallback: string): string {
  const s = typeof input === "string" ? input.trim() : "";
  return s.length > 0 && s.length <= 64 ? s : fallback;
}

export class ZoneStore {
  private state: ZoneStoreData | null = null;

  constructor(private readonly filePath = zonesFilePath()) {}

  /** 读取。首次读取时保证 root 区块存在。 */
  load(): ZoneStoreData {
    if (this.state) return this.state;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<ZoneStoreData>;
      if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.zones)) {
        this.state = emptyState();
      } else {
        const zones = parsed.zones.filter(isZone);
        // root 必须存在且唯一
        const roots = zones.filter((z) => z.isRoot);
        if (roots.length !== 1) {
          this.state = emptyState();
        } else {
          this.state = { version: STORE_VERSION, zones };
        }
      }
    } catch {
      this.state = emptyState();
    }
    return this.state;
  }

  private persist(): void {
    const state = this.load();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  listZones(): Zone[] {
    return this.load().zones.map(cloneZone);
  }

  getZone(zoneId: string): Zone | null {
    return this.load().zones.find((z) => z.zoneId === zoneId) ?? null;
  }

  getRootZone(): Zone {
    const root = this.load().zones.find((z) => z.isRoot);
    if (!root) throw new Error("root zone missing");
    return root;
  }

  /** 按外部 sessionId 反查所属区块。 */
  findZoneBySessionId(sessionId: string): Zone | null {
    for (const zone of this.load().zones) {
      if (zone.members.some((m) => m.kind === "external" && m.sessionId === sessionId)) {
        return zone;
      }
    }
    return null;
  }

  /** 按桌面对话 id 反查所属区块（桌面只在 root 或未分配）。 */
  findZoneByConversationId(conversationId: string): Zone | null {
    for (const zone of this.load().zones) {
      if (zone.members.some((m) => m.kind === "desktop" && m.conversationId === conversationId)) {
        return zone;
      }
    }
    return null;
  }

  createZone(input: { name?: unknown; zoneId?: string }): Zone {
    const state = this.load();
    const zoneId = input.zoneId ?? `zone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (state.zones.some((z) => z.zoneId === zoneId)) {
      throw new Error("zone id already exists");
    }
    const zone: Zone = {
      zoneId,
      zoneName: normalizeZoneName(input.name, `区块 ${state.zones.length}`),
      isRoot: false,
      createdAt: Date.now(),
      members: [],
      config: { observeGroupMessages: true, injectOwnerProfile: false },
    };
    state.zones.push(zone);
    this.persist();
    return cloneZone(zone);
  }

  renameZone(zoneId: string, name: unknown): Zone | null {
    const state = this.load();
    const zone = state.zones.find((z) => z.zoneId === zoneId);
    if (!zone) return null;
    if (zone.isRoot) return cloneZone(zone); // root 名固定，忽略
    zone.zoneName = normalizeZoneName(name, zone.zoneName);
    this.persist();
    return cloneZone(zone);
  }

  updateZoneConfig(zoneId: string, patch: Partial<Zone["config"]>): Zone | null {
    const state = this.load();
    const zone = state.zones.find((z) => z.zoneId === zoneId);
    if (!zone) return null;
    if (typeof patch.observeGroupMessages === "boolean") {
      zone.config.observeGroupMessages = patch.observeGroupMessages;
    }
    if (typeof patch.injectOwnerProfile === "boolean") {
      zone.config.injectOwnerProfile = patch.injectOwnerProfile;
    }
    this.persist();
    return cloneZone(zone);
  }

  /** 删除区块（root 不可删）。成员回到"独立域"，不自动迁移。 */
  deleteZone(zoneId: string): boolean {
    const state = this.load();
    const zone = state.zones.find((z) => z.zoneId === zoneId);
    if (!zone || zone.isRoot) return false;
    state.zones = state.zones.filter((z) => z.zoneId !== zoneId);
    this.persist();
    return true;
  }

  /** 把一个外部会话加入区块（自动从原区块移出）。 */
  addExternalMember(zoneId: string, member: ZoneMember): Zone | null {
    const state = this.load();
    const zone = state.zones.find((z) => z.zoneId === zoneId);
    if (!zone) return null;
    if (member.kind !== "external") throw new Error("only external members can be added here");
    removeMemberByKey(state, memberKey(member));
    // root 区块最多 1 个 QQ 私聊
    if (zone.isRoot && member.chatType === "private") {
      const existingPrivates = zone.members.filter(
        (m) => m.kind === "external" && m.chatType === "private",
      );
      if (existingPrivates.length >= 1) {
        throw new Error("root 区块只能有一个私聊映射");
      }
    }
    zone.members.push(cloneMember(member));
    this.persist();
    return cloneZone(zone);
  }

  removeMember(zoneId: string, member: ZoneMember): Zone | null {
    const state = this.load();
    const zone = state.zones.find((z) => z.zoneId === zoneId);
    if (!zone) return null;
    const key = memberKey(member);
    zone.members = zone.members.filter((m) => memberKey(m) !== key);
    this.persist();
    return cloneZone(zone);
  }

  /** 批量把多个外部会话移动到目标区块。 */
  moveMembers(targetZoneId: string, members: ZoneMember[]): { moved: number; errors: string[] } {
    const errors: string[] = [];
    let moved = 0;
    for (const member of members) {
      try {
        if (this.addExternalMember(targetZoneId, member)) moved += 1;
        else errors.push(`zone not found: ${targetZoneId}`);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    return { moved, errors };
  }

  /** 查询所有"已在区块中"的外部 sessionId（供白名单判定）。 */
  listAllowedSessionIds(): Set<string> {
    const out = new Set<string>();
    for (const zone of this.load().zones) {
      for (const m of zone.members) {
        if (m.kind === "external") out.add(m.sessionId);
      }
    }
    return out;
  }

  /** 查询所有"已在区块中"的群 chatId（按渠道）——群白名单判定用。 */
  listAllowedGroupKeys(): Set<string> {
    const out = new Set<string>();
    for (const zone of this.load().zones) {
      for (const m of zone.members) {
        if (m.kind === "external" && m.chatType === "group") {
          out.add(`${m.channel}:${m.chatId}`);
        }
      }
    }
    return out;
  }
}

// ── helpers ──
function memberKey(m: ZoneMember): string {
  return m.kind === "desktop" ? `desktop:${m.conversationId}` : `external:${m.sessionId}`;
}
function removeMemberByKey(state: ZoneStoreData, key: string): void {
  for (const zone of state.zones) {
    zone.members = zone.members.filter((m) => memberKey(m) !== key);
  }
}
function cloneMember(m: ZoneMember): ZoneMember {
  return { ...m };
}
function cloneZone(z: Zone): Zone {
  return { ...z, members: z.members.map(cloneMember), config: { ...z.config } };
}
function isZone(value: unknown): value is Zone {
  if (!value || typeof value !== "object") return false;
  const z = value as Partial<Zone>;
  return typeof z.zoneId === "string"
    && typeof z.zoneName === "string"
    && typeof z.isRoot === "boolean"
    && typeof z.createdAt === "number"
    && Array.isArray(z.members)
    && !!z.config && typeof z.config === "object";
}

// ── singleton ──
let defaultStore: ZoneStore | null = null;
export function getZoneStore(): ZoneStore {
  if (!defaultStore) defaultStore = new ZoneStore();
  return defaultStore;
}
export function _resetZoneStoreForTest(store: ZoneStore | null = null): void {
  defaultStore = store;
}
```

### 5.2 单例注意

`ZoneStore.state` 是进程内缓存。**删除/重载 zones.json 后需要 `_resetZoneStoreForTest(null)` 或重启**。区块的增删改都走 store 方法（内部 `persist()`），所以正常运行期不存在"外部改文件"的问题。

---

## 6. 任务 C：Scope 解析器

### 6.1 新建 `src/main/zones/scope.ts`

```ts
import { getZoneStore } from "./zone-store";
import { soloScope, zoneScope, type MemoryScopeId } from "./types";

const CHANNEL_PREFIX = "channel:";

/**
 * 解析一次运行所属的记忆域。
 *
 * 规则（与用户约定一致）：
 *   - 桌面对话：默认 root 区块。若该对话被显式加入某区块，则用该区块。
 *   - 外部会话：若在某区块 → 该区块；否则 → solo:<sessionId>（独立域）。
 *
 * @param sessionId 桌面对话 id（cyrene-chats）或渠道 sessionId（channel:...）
 */
export function resolveScopeId(sessionId: string | undefined | null): MemoryScopeId {
  if (!sessionId) return zoneScope("root");

  const store = getZoneStore();

  if (sessionId.startsWith(CHANNEL_PREFIX)) {
    const zone = store.findZoneBySessionId(sessionId);
    return zone ? zoneScope(zone.zoneId) : soloScope(sessionId);
  }

  const zone = store.findZoneByConversationId(sessionId);
  return zone ? zoneScope(zone.zoneId) : zoneScope("root");
}

/** 当前域是否允许注入 owner 的 L0/L1 画像。 */
export function shouldInjectOwnerProfile(scopeId: MemoryScopeId): boolean {
  if (scopeId === zoneScope("root")) return true;
  if (scopeId.startsWith("solo:")) {
    // 独立外部会话（尤其群）默认不注入画像，避免隐私外泄
    return false;
  }
  const zoneId = scopeId.slice("zone:".length);
  const zone = getZoneStore().getZone(zoneId);
  return zone?.config.injectOwnerProfile ?? false;
}

/** 当前域是否旁听群消息。 */
export function shouldObserveGroupMessages(zoneId: string): boolean {
  return getZoneStore().getZone(zoneId)?.config.observeGroupMessages ?? true;
}

/** 内部：把 sessionId 解析成所属 zone（可能为 null）。供白名单逻辑复用。 */
export function findZoneBySessionId(sessionId: string) {
  return getZoneStore().findZoneBySessionId(sessionId);
}
```

### 6.2 测试

**文件**：`src/main/zones/scope.test.ts`（新建）

覆盖：
- 桌面 conversationId 未分配 → `zone:root`
- 桌面 conversationId 在自定义区块 → 该区块
- 外部 sessionId 在区块 → 该区块
- 外部 sessionId 不在任何区块 → `solo:<sessionId>`
- `undefined` → `zone:root`
- `shouldInjectOwnerProfile`：root=true；solo=false；自定义区块看 config

---

## 7. 任务 D：记忆写入打 scope

### 7.1 传递链路

记忆写入的入口是 `scheduleMemoryWrite(userText, reply, conversationId)`：

```
run 结束
  → build-options.ts: onAgentRunFinished
  → deps.scheduleMemoryWrite(sideEffectUserText, chatContent, conversationId)
  → context-builder.ts: scheduleMemoryWrite
  → memory-scheduler.ts: scheduleMemoryWrite(...)
  → memoryManager.writeMemory(candidates)
  → memoryStore.addL2Memory({...})
```

**改造**：让 `conversationId` 一路带到 L2 写入，并在写入时解析 scope。

### 7.2 `src/main/memory/context-builder.ts`

```ts
// 修改前
export function scheduleMemoryWrite(userInput: string, assistantReply: string, conversationId?: string): void {
  memoryScheduler.scheduleMemoryWrite(userInput, assistantReply, conversationId);
}

// 修改后：签名不变，但把 conversationId 原样带下去（已有）
// 仅确认 conversationId 在渠道路径上就是 sessionId（channels/bootstrap.ts 传的是 sessionId）
```

> **核对点**：`channels/bootstrap.ts:291` 调 `onRunFinished(..., { conversationId: sessionId, ... })`，其中 `sessionId` 是 `channel:...`。而 `onAgentRunFinished` 的 `conversationId` 参数会传给 `deps.scheduleMemoryWrite`。**这条链路已经通了**，无需改签名。

### 7.3 `src/main/memory/memory-scheduler.ts`

`scheduleMemoryWrite` 现在按 **全局** `recentTurns` 混桶（多群并发会串味）。改为**按 scope 分桶**：

```ts
export class MemoryScheduler {
  /** 按 scope 分桶的近期轮次。 */
  private turnsByScope = new Map<MemoryScopeId, Array<MemoryJudgeTurn & { seq: number }>>();
  private nextTurnSeq = 0;

  scheduleMemoryWrite(userInput: string, assistantReply: string, conversationId?: string): void {
    const scopeId = resolveScopeId(conversationId);
    const seq = ++this.nextTurnSeq;
    const bucket = this.turnsByScope.get(scopeId) ?? [];
    bucket.push({ seq, userInput, assistantReply });
    if (bucket.length > MEMORY_JUDGE_CONTEXT_TURNS * 2) {
      bucket.splice(0, bucket.length - MEMORY_JUDGE_CONTEXT_TURNS * 2);
    }
    this.turnsByScope.set(scopeId, bucket);

    this.deps.enqueueTask("MemoryMaintenance", async () => {
      await this.runQueuedMemoryWrite(scopeId, seq, conversationId);
    }).catch((e) => {
      console.error("[PMRS/Scheduler] 记忆写入失败，不影响主流程", e);
    });
  }

  private async runQueuedMemoryWrite(scopeId: MemoryScopeId, seq: number, conversationId?: string): Promise<void> {
    const l1 = await this.deps.getL1();
    // ⚠️ roundCount 仍是全局的（判定频率），但 judge 的输入按 scope 隔离
    const newCount = (l1.roundCount || 0) + 1;

    if (newCount % MEMORY_JUDGE_INTERVAL === 0) {
      try {
        const bucket = this.turnsByScope.get(scopeId) ?? [];
        const turns = bucket
          .filter((t) => t.seq <= seq)
          .slice(-MEMORY_JUDGE_CONTEXT_TURNS)
          .map(({ userInput, assistantReply }) => ({ userInput, assistantReply }));
        const { candidates, entities } = await this.deps.judgeMemory(turns, conversationId ?? "default");
        // 把 scope 注入到每个候选（新增）
        const scoped = candidates.map((c) => ({ ...c, scope: scopeId } as MemoryCandidate & { scope: MemoryScopeId }));
        if (scoped.length > 0) {
          await this.deps.writeMemory(scoped);
        }
        if (entities.length > 0) {
          this.deps.ingestEntities(entities, scopeId);   // 实体也带 scope
        }
      } catch (err) {
        console.error("[PMRS/Scheduler] Judge/Manager 执行失败，本轮仍会计数", err);
      }
    }
    // ...其余（resolver / reflection / decay）保持原样
  }
}
```

**需要同步修改的依赖类型**：
- `MemorySchedulerDeps.writeMemory: (candidates: MemoryCandidate[]) => Promise<void>` → 保持，但 candidate 上多带 `scope`
- `MemorySchedulerDeps.ingestEntities: (entities: ExtractedEntity[], scopeId: MemoryScopeId) => void` → 加参数
- `MemorySchedulerDeps.getL1()` 不变
- 新增 import：`resolveScopeId` from `../zones/scope`，`MemoryScopeId` from `../zones/types`

> **注意**：`MEMORY_JUDGE_INTERVAL` 的 `roundCount` 仍全局累加。这是**有意的权衡**：判定频率用全局计数（简单），但**judge 的输入**（turns）按 scope 隔离。若未来要按 scope 计频，再单独改。

### 7.4 `src/main/memory/memory-manager.ts`

`writeMemory` 接收带 scope 的候选，写 L2 时带上：

```ts
private async writeL2(candidate: MemoryCandidate & { scope?: MemoryScopeId }): Promise<void> {
  const l2Input: Omit<L2Memory, "id" | "createdAt" | "lastAccessedAt" | "accessCount" | "weight" | "status"> = {
    content: candidate.content,
    triggerText: candidate.triggerText,
    sourceConversationId: candidate.sourceConversationId ?? "",
    embedding: [],
    isPinned: false,
    syncStatus: "pending_sync",
    scope: candidate.scope,          // ← 新增
  };
  // ...其余不变

  const ragId = await addL2MemoryVector(candidate.content, l2.id, {
    triggerText: candidate.triggerText,
    confidence: candidate.confidence,
  }, candidate.scope);               // ← 新增参数，见任务 E
  // ...
}
```

**L0/L1 的处理**：
- **L0/L1 是 owner 级画像**。群聊里的候选**不应**升级为 owner 的 L0/L1。
- 在 `writeMemory` 的 L0/L1 分支加守卫：

```ts
if (candidate.layer === "L0" || candidate.layer === "L1") {
  if (candidate.scope && candidate.scope !== zoneScope("root")) {
    console.log("[PMRS/Manager] 非 root 域的 L0/L1 候选被丢弃（不污染 owner 画像）");
    continue;
  }
  // ...原有 L0/L1 写入逻辑
}
```

> 这解决了"群里陌生人一句话改写你的画像"的问题。

### 7.5 `MemoryCandidate` 加可选 scope

**文件**：`src/main/memory/memory-types.ts`

```ts
export interface MemoryCandidate {
  // ...原有字段
  /** 由调度层注入（非 LLM 输出）：本条候选所属记忆域。 */
  scope?: string
}
```

---

## 8. 任务 E：记忆读取按 scope 过滤

### 8.1 `memory-store.ts`：按 scope 取 L2

新增方法（保留 `getAllL2` 供迁移/管理 UI 用）：

```ts
/** 取指定域的全部 L2（scope 精确匹配）。 */
async getL2ForScope(scopeId: MemoryScopeId): Promise<L2Memory[]> {
  const store = await this.load()
  return store.l2.filter((m) => m.scope === scopeId)
}

/** 取指定域的 L2 DMAE 状态。 */
async getL2DmaeStatesForScope(scopeId: MemoryScopeId): Promise<L2DmaeState[]> {
  const store = await this.load()
  const ids = new Set(store.l2.filter((m) => m.scope === scopeId).map((m) => m.id))
  return (store.l2DmaeStates ?? []).filter((s) => ids.has(s.l2Id))
}
```

`addL2Memory` / `addL2Batch` 需把 `input.scope` 透传（`L2Input` 已包含 `scope`，因为它是 `Omit<L2Memory, ...>`）。

**同样处理**：
- `getEvidenceByMemoryId` 不变（按 memoryId 查）
- `deleteL2` 不变
- `decayL2Weights` 不变（全局衰减）
- **新增** `deleteL2ByScope(scopeId)`（区块删除时可选用，Phase 2 可先不做）

### 8.2 `orchestrator/index.ts`：L2 注入按 scope

```ts
// 修改前
const allL2 = await memoryStore.getAllL2();
const activeL2 = await l2DmaeManager.getActiveL2ForPrompt(allL2, 4);

// 修改后
const scopeId = resolveScopeId(trace?.sessionId);
const allL2 = await memoryStore.getL2ForScope(scopeId);
const activeL2 = await l2DmaeManager.getActiveL2ForPrompt(allL2, 4, scopeId);
```

> `l2DmaeManager.getActiveL2ForPrompt(l2List, maxCount, scopeId?)` 需要加可选 scope 参数，内部 DMAE 状态表也应按 scope 分桶（见 8.7）。

### 8.3 `orchestrator/index.ts`：L0/L1 注入按域开关

```ts
// ── L0/L1 画像 — 按域决定是否注入 ──
try {
  const scopeId = resolveScopeId(trace?.sessionId);
  if (shouldInjectOwnerProfile(scopeId)) {
    const l0 = await memoryStore.getL0();
    const l1 = await memoryStore.getL1();
    // ...原有 l0Lines / l1Lines 逻辑
  }
} catch (err) { /* ... */ }
```

### 8.4 `rag/index.ts`：向量检索按 scope 过滤

`searchMemoryEntries` 已有 `allowedEntryIds` 机制（现在用于 `user_memory` 的可召回性过滤）。扩展为 **scope 过滤**：

```ts
export async function searchMemoryEntries(
  query: string,
  source?: string,
  topK = 5,
  options?: { recordRecall?: boolean; scopeId?: MemoryScopeId },
): Promise<...> {
  if (!retriever) return [];
  let allowedEntryIds: string[] | undefined;

  if (source === "user_memory") {
    const { memoryStore } = await import("../memory/memory-store");
    const memories = await memoryStore.getAllL2();
    const recallableById = new Map(
      memories
        .filter(isL2LocallyRecallable)
        .filter((m) => options?.scopeId === undefined || m.scope === options.scopeId)   // ← scope 过滤
        .map((m) => [m.id, m]),
    );
    allowedEntryIds = getEntriesBySource("user_memory")
      .filter((entry) => {
        const l2Id = entry.metadata?.l2Id;
        if (typeof l2Id !== "string") return false;
        return recallableById.get(l2Id)?.ragId === entry.id;
      })
      .map((entry) => entry.id);
  } else if (source === "chat_history" && options?.scopeId !== undefined) {
    // ← 新增：chat_history 也按 scope 过滤（靠 entry.metadata.scope）
    allowedEntryIds = getEntriesBySource("chat_history")
      .filter((entry) => entry.metadata?.scope === options.scopeId)
      .map((entry) => entry.id);
  }

  const results = await retriever.retrieve(query, source, topK, { allowedEntryIds });
  // ...
}
```

**`addMemory` 需要支持写 scope**：

```ts
export async function addMemory(
  text: string,
  source = "user_memory",
  metadata?: Record<string, unknown>,
): Promise<string> {
  if (!store || !provider) throw new Error("RAG not initialized");
  const entry = await store.add(text, source, provider, metadata);  // metadata.scope 由调用方塞入
  return entry.id;
}
```

### 8.5 `history-tools.ts`：`indexConversationTurn` 与 `recall_history` 按 scope

```ts
// indexConversationTurn：写入时带 scope
export async function indexConversationTurn(
  sessionId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  const ts = Date.now();
  const scope = resolveScopeId(sessionId);        // ← 新增
  try {
    if (userText) {
      await addMemory(userText, "chat_history", { sessionId, role: "user", ts, scope });
    }
    if (assistantText) {
      await addMemory(assistantText, "chat_history", { sessionId, role: "assistant", ts, scope });
    }
  } catch (e) {
    console.warn(LOG_PREFIX, "索引对话失败:", e);
  }
}
```

`recall_history` 工具的 `execute` 需要拿到**当前会话的 scope**。工具执行上下文里有 `conversationId`——从 `toolContext` 取：

```ts
// recall_history 的 execute(args, ctx)
execute: async (args, ctx) => {
  const scopeId = resolveScopeId(ctx?.conversationId);
  const hits = await searchHistoryEntries(query, 5, scopeId);   // ← 传 scope
  // ...
}
```

`searchHistoryEntries` 加参数：

```ts
export async function searchHistoryEntries(
  query: string,
  topK = 5,
  scopeId?: MemoryScopeId,
): Promise<...> {
  if (!retriever) return [];
  let allowedEntryIds: string[] | undefined;
  if (scopeId !== undefined) {
    allowedEntryIds = getEntriesBySource("chat_history")
      .filter((e) => e.metadata?.scope === scopeId)
      .map((e) => e.id);
  }
  const results = await retriever.retrieve(query, "chat_history", topK, { allowedEntryIds });
  // ...
}
```

> **必须先核对**：`recall_history` 的 `execute` 当前签名只有 `(args)`。需要确认工具框架是否把 `ctx`（含 `conversationId`）传进 execute。若没有，需要在 `tool-registry` 的 execute 调用处补上——**这是本任务最大的不确定点，实现时先查**。

### 8.6 `relationship-log.ts`：加 scope

```ts
export interface RelationshipTurnInput {
  userText: string
  assistantText: string
  cyreneFeeling: string
  channel: RelationshipChannel
  /** 所属记忆域。Phase 2 新增。 */
  scope?: MemoryScopeId
}
```

`buildContext(scopeId)` 过滤最近 8 条时按 scope：

```ts
async buildContext(scopeId?: MemoryScopeId): Promise<string> {
  const data = readData(this.filePath)
  const scoped = scopeId === undefined
    ? data.entries
    : data.entries.filter((e) => e.scope === scopeId)
  const recent = scoped.slice(-8)
  // ...其余不变（dailySummaries 也按 scope 过滤或用最近一条）
}
```

调用点 `build-options.ts:521`：

```ts
const scopeId = resolveScopeId(input.sessionId);
relationshipContext = await deps.buildRelationshipContext(scopeId);
```

`buildRelationshipContext` 签名加可选 scope。`recordRelationshipTurn` 的调用点（`onAgentRunFinished` 里）也要带上 scope。

> **注意**：`relationship-log.json` 是老格式（无 scope 字段）。Phase 2 清空后不存在兼容问题；但**若用户没走清空流程**（如手工删了 memory.json 但没删 relationship-log），旧记录 scope 为 undefined → 若 `buildContext` 传了 scopeId，旧记录会被过滤掉，表现为"关系线索消失"。可接受（清空流程是正规路径）。

### 8.7 `l2-dmae-manager.ts`：DMAE 状态按 scope 分桶

`l2-dmae-manager` 当前持有 `dmae` / `intrinsicValues` 两个 Map（进程内，按 l2Id）。因为现在传入的 `l2List` 已经按 scope 过滤，**Map 天然不会串**（不同 scope 的 l2Id 不重叠）。

**因此本任务只需**：
```ts
async getActiveL2ForPrompt(l2List: L2Memory[], maxCount = 4, scopeId?: MemoryScopeId): Promise<L2Memory[]>
```
把 `scopeId` 透传给内部（用于 key 拼接，防止未来 l2Id 复用时冲突）：
```ts
const key = scopeId ? `${scopeId}::${l2.id}` : l2.id
```

若时间紧，**可先只加参数不用**（因为 l2List 已过滤），标注 TODO。

### 8.8 `entity-graph.ts`：加 scope

`EntityNode` / relations 加 `scope`：

```ts
export interface EntityNode {
  id: string
  name: string
  type: EntityType
  aliases: string[]
  mentionCount: number
  firstMentionedAt: number
  lastMentionedAt: number
  /** 所属记忆域。Phase 2 新增。 */
  scope?: MemoryScopeId
}
```

- `ingestEntities(extracted, scopeId)` — 按 `(scope, name)` 去重
- `search(text, scopeId?)` — 只返回该 scope 的实体
- `buildMemoryInjection` 里 `entityGraph.search(userInput, scopeId)`
- `feedEntityNamesToJieba()` 保持不变（全局词典无害）

### 8.9 `moments` / `chat-social-atoms`：owner-only

这两个是"你的私人生活"数据。Phase 2 **不改造其存储**，而是**限制注入**：

- `build-options.ts`：只在 `scopeId === zoneScope("root")` 时注入 `momentsContextBlock`
- social-context atoms：同上

```ts
const isOwnerScope = resolveScopeId(input.sessionId) === zoneScope("root");
const momentsContextEnabled = isChatMode && isOwnerScope && styleSettings.chatMomentsContextEnabled === true && ...;
```

---

## 9. 任务 F：群上下文条数可配置

### 9.1 新增设置字段

**文件**：`src/main/settings/general-settings.ts`

```ts
export interface GeneralSettings extends ChatAppearanceSettings {
  // ...
  /**
   * 群聊近期上下文注入条数。取值 3~50，默认 10。
   * 影响 buildAlwaysOnContext 里 buildGroupContextBlock 的 limit。
   */
  groupContextLimit: number;
}
```

### 9.2 默认值 + 归一化

**文件**：`src/main/settings/settings-facade.ts`

```ts
const DEFAULT_GENERAL: GeneralSettings = {
  // ...
  groupContextLimit: 10,
};

// 归一化（saveGeneral 内部）
function normalizeGroupContextLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 10;
  return Math.min(50, Math.max(3, Math.round(n)));
}
```

### 9.3 消费点

**文件**：`src/main/orchestrator/index.ts`

```ts
// 删除模块级常量 GROUP_CONTEXT_LIMIT，改为运行时读取
import { loadGeneralSettings } from "../settings/settings-facade";   // 注意潜在循环依赖

// buildAlwaysOnContext 内：
if (trace?.chatType === "group") {
  const limit = resolveGroupContextLimit();     // 见下
  const groupContext = buildGroupContextBlock(trace.sessionId, limit);
  if (groupContext) parts.push(groupContext);
}
```

**循环依赖风险**：`settings-facade` 可能间接 import orchestrator。**两种规避方案**：

① **注入式**（推荐）：把 `groupContextLimit` 加进 `ChannelTraceContext`
```ts
export interface ChannelTraceContext {
  sessionId: string;
  chatType?: ChannelChatType;
  /** 群上下文条数；由 build-options 从 general settings 读出后注入。 */
  groupContextLimit?: number;
}
```
`build-options.ts` 构造 trace 时填：
```ts
const trace: ChannelTraceContext | undefined = input.sessionId
  ? {
      sessionId: input.sessionId,
      ...(input.chatType ? { chatType: input.chatType } : {}),
      groupContextLimit: normalizeGroupContextLimit(deps.loadGeneralSettings().groupContextLimit),
    }
  : undefined;
```
`orchestrator/index.ts` 用 `trace.groupContextLimit ?? 10`。

> 需要 `StyleSettingsLite` 暴露 `groupContextLimit?: number`。

② 惰性 require：`const { loadGeneralSettings } = require("../settings/settings-facade")` —— 不推荐。

**采用 ①**。

### 9.4 UI：设置-记忆 面板

在 `memory-panel` 里新增一张卡片（放在 L2 之后、"导入知识"之前）：

```html
<div class="memory-card">
  <div class="memory-card__head">
    <div>
      <h2><span data-i18n="panel.memory.groupContext.title">群聊上下文</span></h2>
      <p><span data-i18n="panel.memory.groupContext.desc">昔涟在群里回复时，会一并读取本群最近的消息条数。</span></p>
      <p class="memory-card__hint"><span data-i18n="panel.memory.groupContext.hint">条数越多越能理解上下文，但会消耗更多 token。</span></p>
    </div>
  </div>
  <div class="memory-fields">
    <div class="memory-field">
      <label><span data-i18n="panel.memory.groupContext.field">消息条数</span></label>
      <input id="memory-group-context-limit" type="number" min="3" max="50" step="1" value="10" />
    </div>
  </div>
</div>
```

**渲染 + 保存**：
- `src/renderer/settings/memory/dom.ts` 加 `export const memoryGroupContextLimitInput = document.getElementById("memory-group-context-limit") as HTMLInputElement | null;`
- `loadMemoryPanel` 里从 general settings 读值填进去（需要一个通用设置读取 IPC，如已有 `window.settings.getGeneral()`）
- 变更时调 `window.settings.saveGeneral({ groupContextLimit })`（沿用现有保存通路），或做成"输入后失焦即保存"

> **实现提示**：memory panel 目前只读 `window.memoryPanel.*`。要读 general settings，需确认 preload 是否暴露了 `window.settings.getGeneral()`。若没有，**新增一个最小 IPC**：`MEMORY_PANEL_GET_SETTINGS` / `MEMORY_PANEL_SAVE_SETTINGS`，只处理 `groupContextLimit` 一个字段（避免耦合 settings 面板）。

---

## 10. 任务 H：UI「记忆区块」面板

### 10.1 侧边栏新增项

**文件**：`src/renderer/settings/index.html`

在 `data-section="memory"` 的 nav-item **之后**插入：

```html
<button type="button" class="nav-item" data-section="zones">
  <span><!-- 图标：用现有 memory 图标或自选 --></span>
  <span data-i18n="nav.zones">记忆区块</span>
</button>
```

> 用户要求"挨着记忆选项卡"，所以插在 memory 之后、user 之前。

### 10.2 面板结构

在 `memory-panel` section **之后**新增：

```html
<section class="settings-panel is-hidden" id="zones-panel" data-panel="zones">
  <div class="panel-heading">
    <div>
      <h1><span data-i18n="panel.zones.heading">记忆区块</span></h1>
      <p><span data-i18n="panel.zones.subheading">把会话归入同一个区块，它们就会共享记忆。不同区块之间互不可见。</span></p>
    </div>
  </div>
  <div class="panel-body">
    <div class="zones-toolbar">
      <button type="button" class="ghost-btn" id="zones-create-btn">
        <span data-i18n="panel.zones.createButton">+ 新建区块</span>
      </button>
      <div class="zones-batch-actions is-hidden" id="zones-batch-bar">
        <span id="zones-batch-count"></span>
        <button type="button" class="ghost-btn" id="zones-batch-move-btn"><span data-i18n="panel.zones.batchMove">移动到…</span></button>
        <button type="button" class="ghost-btn" id="zones-batch-remove-btn"><span data-i18n="panel.zones.batchRemove">移出区块</span></button>
      </div>
    </div>
    <div class="zones-list" id="zones-list"></div>
  </div>
</section>
```

**每个区块卡片**（由 JS 渲染）包含：
- 标题（可重命名，root 不可改）
- 成员数徽章
- 成员列表：每行 = 复选框 + 类型徽章（桌面/私聊/群聊）+ 名称 + chatId + "移出"按钮
- root 卡片额外显示：`私聊映射：<昵称>（↔ 桌面双向）`
- 配置行：
  - `旁听群消息` 开关（root + 自定义都可）
  - `注入我的画像（L0/L1）` 开关（root 固定开且禁用；自定义可改）
- 操作：`添加成员`、`删除区块`（root 不显示）

### 10.3 新建目录 `src/renderer/settings/zones/`

```
zones/
  dom.ts       — DOM 引用
  state.ts     — 面板缓存（snapshot）
  panel.ts     — 业务逻辑（加载/渲染/事件）
  picker.ts    — 成员选择器（复用 externalChats + conversations）
```

### 10.4 成员选择器数据来源

复用现有 `CHANNELS_CONTEXT_BINDINGS_GET` 返回的 `externalChats`（`bootstrap.ts:103` 的 `observeExternalChat` 会持续记录所有见过的外部会话），以及 `conversations`（桌面对话列表）。

需要**新增 IPC**：

```
IPC.ZONES_LIST              = "zones:list"          → { zones, externalChats, conversations }
IPC.ZONES_CREATE            = "zones:create"        → Zone
IPC.ZONES_RENAME            = "zones:rename"        → Zone | null
IPC.ZONES_DELETE            = "zones:delete"        → boolean
IPC.ZONES_UPDATE_CONFIG     = "zones:update-config" → Zone | null
IPC.ZONES_ADD_MEMBER        = "zones:add-member"    → { ok, zone?, error? }
IPC.ZONES_REMOVE_MEMBER     = "zones:remove-member" → { ok, zone? }
IPC.ZONES_MOVE_MEMBERS      = "zones:move-members"  → { moved, errors }
```

**新建** `src/main/zones/zones-ipc.ts`，并在 composition root 注册（参照 `memory-user-ipc.ts` 的 `createIpcScope` 模式）。

### 10.5 校验规则（服务端强制）

| 操作 | 规则 | 违反时 |
|---|---|---|
| 创建区块 | 名字 1~64 字符 | 回退到"区块 N" |
| 重命名 | root 不可改名 | 忽略 |
| 删除区块 | root 不可删 | 拒绝 |
| 加外部成员到 root | 私聊最多 1 个 | 报错"root 区块只能有一个私聊映射" |
| 加成员到任意区块 | 该成员会从原区块自动移出 | 静默处理 |
| 加桌面成员 | **仅 root 允许**；且 root 自动包含所有桌面会话 | 非 root 拒绝 |

> **桌面的处理**：root **隐式包含所有桌面对话**，不需要用户手工添加。UI 上 root 卡片可以列出桌面对话（只读展示 + 说明"自动包含"）。这样 `findZoneByConversationId` 对桌面永远返回 root（除非显式加入其它区块——但按规则不允许）。

**简化实现（推荐）**：`resolveScopeId` 里桌面对话**直接返回 `zone:root`**，不查 zone store。UI 只展示。这样避免"桌面成员"的存储与同步问题：

```ts
if (!sessionId.startsWith(CHANNEL_PREFIX)) return zoneScope("root");
```
（简化后 `findZoneByConversationId` 可保留但不用）

### 10.6 样式

`settings.css` 新增 `.zones-list` / `.zone-card` / `.zone-member-row` / `.zones-toolbar` 等类。可复用 `.memory-card` 的基础样式，减少新 CSS 量。

---

## 11. 任务 I：废弃旧"清空记录"

### 11.1 删除的内容

| 文件 | 删除项 |
|---|---|
| `src/renderer/settings/index.html:499-505` | `chatHistory` setting-row + `clear-chat-history-btn` |
| `src/renderer/settings/settings.ts:1095-1112` | `clearChatHistoryBtn.addEventListener(...)` 整段 |
| `src/renderer/settings/general/dom.ts:25` | `export const clearChatHistoryBtn = ...` |
| `src/renderer/settings/settings.ts:63` | import 列表里的 `clearChatHistoryBtn` |
| `src/renderer/settings/mcp/panel.test.ts:46-47` | 断言 `clearChatHistoryBtn` 的测试（改为断言它**不存在**） |
| i18n `panel.general.chatHistory.*` | 可保留（无害）或删除 |

### 11.2 替代

新的"删除全部记忆"放在 **设置-记忆** 面板底部：

```html
<div class="memory-card memory-card--danger">
  <div class="memory-card__head">
    <div>
      <h2><span data-i18n="panel.memory.deleteAll.title">删除全部记忆</span></h2>
      <p><span data-i18n="panel.memory.deleteAll.desc">清空昔涟对你的所有记忆：画像、事件片段、向量索引、关系日志、实体图谱、朋友圈、群聊记录。</span></p>
      <p class="memory-card__hint"><span data-i18n="panel.memory.deleteAll.hint">不会删除桌面对话记录、表情包、配置和定时任务。此操作不可撤销。</span></p>
    </div>
  </div>
  <button type="button" class="ghost-btn ghost-btn--danger" id="memory-delete-all-btn">
    <span data-i18n="panel.memory.deleteAll.button">删除全部记忆</span>
  </button>
</div>
```

**二次确认（输入"确认删除"）** 用现有 `showModal` 或自建输入框弹窗：

```
┌─────────────────────────────────────┐
│  ⚠️ 删除全部记忆                    │
│                                     │
│  此操作不可撤销，将清空昔涟的所有记忆。│
│  请输入「确认删除」以继续：           │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│         [取消]  [确认删除(禁用)]     │
└─────────────────────────────────────┘
```

- 输入框内容严格等于 `确认删除` 时，"确认删除"按钮才可点
- 点击后调 `window.memoryPanel.deleteAll()`
- 返回 `restartRequired: true` → 弹第二个提示"已删除，需重启生效"，带"立即重启"按钮

### 11.3 preload 新增

**文件**：`src/preload/index.ts`（`memoryPanelApi`）

```ts
const memoryPanelApi = {
  // ...原有
  deleteAll: () => ipcRenderer.invoke(IPC.MEMORY_DELETE_ALL),
  restartApp: () => ipcRenderer.invoke(IPC.APP_RESTART),
  getZoneSnapshot: () => ipcRenderer.invoke(IPC.ZONES_LIST),
  createZone: (name: string) => ipcRenderer.invoke(IPC.ZONES_CREATE, { name }),
  renameZone: (zoneId: string, name: string) => ipcRenderer.invoke(IPC.ZONES_RENAME, { zoneId, name }),
  deleteZone: (zoneId: string) => ipcRenderer.invoke(IPC.ZONES_DELETE, { zoneId }),
  updateZoneConfig: (zoneId: string, patch: unknown) => ipcRenderer.invoke(IPC.ZONES_UPDATE_CONFIG, { zoneId, patch }),
  addZoneMember: (zoneId: string, member: unknown) => ipcRenderer.invoke(IPC.ZONES_ADD_MEMBER, { zoneId, member }),
  removeZoneMember: (zoneId: string, member: unknown) => ipcRenderer.invoke(IPC.ZONES_REMOVE_MEMBER, { zoneId, member }),
  moveZoneMembers: (targetZoneId: string, members: unknown[]) => ipcRenderer.invoke(IPC.ZONES_MOVE_MEMBERS, { targetZoneId, members }),
};
```

`IPC` 常量定义在 `src/shared/ipc-channels.ts`。

---

## 12. 任务 J：群白名单并入区块

### 12.1 现状

- `channels-settings.json` → `qq.allowedGroupIds: string[]`
- 判定点：`napcat-adapter.ts` 的 `classifyQqEvent` → `config.allowedGroupIds.includes(groupId)`
- QQ 官方机器人：`qqbot.allowedGroupOpenids`（另一套）
- UI：`src/renderer/settings/channels/panel.ts` 里的群号白名单输入

### 12.2 改造

**新增判定优先级**：
```
群在白名单 = allowedGroupIds.includes(groupId)   // 兼容期保留
           ∨ zoneStore.listAllowedGroupKeys().has(`qq:${groupId}`)   // 新区块成员
```

**实现**：在 `classifyQqEvent` 里注入一个可选的 `isGroupAllowed` 回调（保持纯函数可测性）：

```ts
export function classifyQqEvent(
  event: {...},
  config: QqChannelConfig,
  selfId: string,
  triggerKeywords: readonly string[] = [],
  access: ChannelToolAccessConfig = DEFAULT_TOOL_ACCESS,
  options?: { isGroupAllowed?: (groupId: string) => boolean },   // ← 新增
): QqEventDecision {
  // ...
  const groupAllowed = config.allowedGroupIds.includes(groupId)
    || (options?.isGroupAllowed?.(groupId) ?? false);
  if (!groupAllowed) {
    return { action: "drop", reason: `群 ${groupId} 不在任何区块中`, allowlist: false };
  }
  // ...
}
```

适配器调用处：
```ts
const decision = classifyQqEvent(
  event, config, this.selfId, settings.keywords.trigger, settings.toolAccess,
  { isGroupAllowed: (gid) => getZoneStore().listAllowedGroupKeys().has(`qq:${gid}`) },
);
```

**同一模式应用到 `qqbot-adapter.ts`**（`allowedGroupOpenids` ∨ 区块成员）。

### 12.3 移除白名单 UI

**文件**：`src/renderer/settings/channels/panel.ts`
- 移除"群号白名单"输入区
- 替换为一段说明 + 跳转按钮："群聊接入已迁移到「记忆区块」。把群号加入区块即视为加入白名单。"

**配置兼容**：`allowedGroupIds` 字段**保留在 schema 里**（不删），但 UI 不再写入。这样：
- 旧配置的群仍然放行（用户可平滑迁移）
- 用户表示"旧的直接删了算了"——可在 release note 里说明；实现上不主动清空（避免误删用户未迁移的群）

> ⚠️ **与用户确认过的点**：用户说"旧的直接删了算了，我到时候自己加"。因此**可以做**主动清空：在 channels settings schema 升到 v3 时把 `allowedGroupIds` 置空。但**默认建议不主动清空**（安全性），在 UI 上提供"清空旧白名单"按钮。实现时二选一，蓝图倾向"保留字段 + UI 引导迁移 + 提供清空按钮"。

---

## 13. 迁移与向后兼容

| 数据 | Phase 2 处理 |
|---|---|
| `memory.json` v2 | **清空**（任务 A 闸门），重建 v3 |
| `rag-data/memory-store.json` | **删除**（任务 A），`initRAG` 会重建空库 |
| `relationship-log.json` | **删除** |
| `entity-graph.json` | **删除** |
| `moments.json` / `chat-social-atoms.json` | **删除** |
| `channels/history/*.jsonl` | **删除**（全部会话 transcript，热层） |
| `channels/archive/**` | **删除**（全部会话按月归档，温层；Phase 1.5 T7 引入） |
| `channels/context-bindings.json` | **保留**（Phase 2 的区块与它共存；绑定=消息映射，区块=记忆域） |
| `cyrene-chats/` | **保留**（桌面对话） |
| `zones.json` | 新建（root 自动生成） |
| `channels-settings.json` | 保留；`allowedGroupIds` 兼容读取 |

> **`context-bindings.json` 与 `zones.json` 的关系**（重要，需要说清）：
> - `context-bindings` 管**消息映射**（QQ 私聊的消息镜像进桌面对话）
> - `zones` 管**记忆域**
> - root 区块里"1 个 QQ 私聊"的映射，**实现上仍复用 `context-bindings`**：当用户把某私聊加入 root 时，UI 引导（或自动）执行 `bindContextConversation(sessionId, conversationId)`。
> - **Phase 2 不做二者的自动同步**，只在 root 区块卡片里展示当前绑定，并提供"绑定到桌面对话"的入口（复用现有 picker）。

---

## 14. 测试计划

### 14.1 单元测试（必须新增）

| 文件 | 覆盖 |
|---|---|
| `src/main/zones/zone-store.test.ts` | 创建/重命名/删除；root 不可删；root 私聊上限 1；成员自动移出原区块；批量移动 |
| `src/main/zones/scope.test.ts` | 四种 scope 解析；`shouldInjectOwnerProfile` |
| `src/main/memory/memory-schema-gate.test.ts` | 版本检测、确认/取消分支 |
| `src/main/memory/memory-deletion.test.ts` | 删除目标清单；失败收集；不删 cyrene-chats |
| `src/main/memory/memory-scheduler.test.ts`（扩展） | **同 scope 分桶**：两个 scope 的 turns 不混；候选带 scope |
| `src/main/memory/memory-store.test.ts`（扩展） | `getL2ForScope` 只返回匹配项 |
| `src/main/orchestrator/group-context-injection.test.ts`（扩展） | 群上下文条数来自 trace；非 group 不注入 |
| `src/main/orchestrator/memory-scope-injection.test.ts`（新） | solo/group 域不注入 L0/L1；root 注入 |
| `src/main/rag/scope-filter.test.ts`（新） | `searchMemoryEntries` 按 scope 过滤 chat_history / user_memory |
| `src/main/relationship/relationship-log.test.ts`（扩展） | `buildContext(scope)` 过滤 |
| `src/main/memory/entity-graph.test.ts`（扩展） | `ingestEntities(e, scope)` / `search(text, scope)` |

### 14.2 回归

```bash
npx vitest run
npx tsc -p tsconfig.main.json --noEmit
npx tsc -p tsconfig.preload.json --noEmit
```

**全绿是硬性门槛**（Phase 1 基线：469 文件 / 4113 通过）。

### 14.3 手工验证

**场景 1：升级清空**
1. 保留现有 `memory.json`（v2）
2. 启动 → 应弹"记忆格式升级"对话框
3. 选"退出应用" → 进程退出，文件未删
4. 重启 → 选"清空记忆并继续" → 检查 `memory.json` 变 v3、`rag-data/memory-store.json` 不存在、`channels/history/` 与 `channels/archive/` 均为空

**场景 2：区块隔离**
1. 新建区块"测试群组"，加入群 X
2. 群 X 里说"我喜欢吃辣" → 走完记忆写入（需等 6 轮 judge 或临时调小 `MEMORY_JUDGE_INTERVAL` 验证）
3. 检查 `memory.json` 里该 L2 的 `scope === "zone:zone_xxx"`
4. 在**另一个**未加入任何区块的群 Y 里问"我喜欢吃什么" → **不应**知道"吃辣"
5. 在群 X 里问同一问题 → **应**知道

**场景 3：L0/L1 不外泄**
1. 设置 L0 的"职业"为"保密测试值"
2. 群里 @昔涟 → 检查 always-on context 日志中**没有** `[用户画像]`
3. 桌面对话 → **有** `[用户画像]`

**场景 4：群上下文条数**
1. 设置-记忆 改为 3 → 群里触发 → 日志里 `【群聊近期上下文】` 只含 3 条
2. 改为 20 → 含 20 条（若群历史足够）

**场景 5：删除全部记忆**
1. 点击"删除全部记忆" → 输入框为空时确认按钮禁用
2. 输入"删除" → 仍禁用；输入"确认删除" → 可点
3. 点击 → 提示重启 → 重启后所有记忆面板为空、`channels/history/` 与 `channels/archive/` 为空、`cyrene-chats/` **仍在**

**场景 6：区块白名单**
1. 从 `channels-settings.json` 移除某群号（模拟不在旧白名单）
2. 把该群加入区块 → 群里 @昔涟 → 应正常响应
3. 从区块移除该群 → 再 @ → 应 drop（控制台无拦截记录，静默）

---

## 15. 风险与回滚

| 风险 | 等级 | 缓解 |
|---|---|---|
| 清空流程误删用户数据 | 🔴 高 | 弹窗明确告知；建议先在 UI 提供"打开 userData 目录"让用户备份 |
| 记忆 scope 漏改某条读取路径 → 仍串味 | 🟡 中 | 逐条核对第 8 节的 9 个读取点；写"作用域不变量测试" |
| `memory-scheduler` 分桶改动影响既有节奏 | 🟡 中 | `roundCount` 保持全局；judge 输入按 scope；有既有测试兜底 |
| `recall_history` 拿不到 `conversationId` | 🟡 中 | **实现前先查 `tool-registry` 的 execute 签名**；若拿不到，退化为"不过滤"并记 TODO |
| 循环依赖（orchestrator ↔ settings） | 🟡 中 | 采用注入式（trace 带 `groupContextLimit`），不 import settings |
| 删除后内存缓存写回旧数据 | 🔴 高 | 强制重启；UI 明确提示 |
| 群白名单迁移把用户挡在群外 | 🟡 中 | 保留 `allowedGroupIds` 兼容读取 + UI 引导 |
| 循环依赖（memory ↔ zones） | 🟢 低 | `zones` 只依赖 electron/fs；memory 单向依赖 zones |

**回滚**：全部改动在 `feat(phase2-zones)` 分支；`git revert` 或删分支即可。数据层因已清空，回滚需用户自行接受（个人开发分支，可接受）。

---

## 16. 建议的 Commit 拆分

每个 commit 必须能独立通过 `vitest run` + `tsc --noEmit`。

1. `feat(memory): add deleteAllMemory + schema gate for v3 clear`（任务 A、G 的 main 侧）
2. `feat(zones): add zone store and scope resolver`（任务 B、C）
3. `refactor(memory): scope L2 writes per zone`（任务 D）
4. `refactor(memory): filter all memory reads by scope`（任务 E）
5. `feat(memory): configurable group context limit`（任务 F）
6. `feat(settings): zones panel + delete-all memory UI`（任务 H、G 的 UI 侧、I）
7. `feat(channels): group allowlist follows zone membership`（任务 J）

---

## 17. 施工 Checklist

- [x] A. `memory-schema-gate.ts` + 启动接入 + 测试
- [x] G-main. `memory-deletion.ts` + `IPC.MEMORY_DELETE_ALL` + 测试
- [x] B. `zones/types.ts` + `zones/zone-store.ts` + 测试
- [x] C. `zones/scope.ts` + 测试
- [x] D1. `MemoryCandidate.scope` + `L2Memory.scope` + schema v3 常量
- [x] D2. `memory-scheduler` 按 scope 分桶 + 候选注入 scope
- [x] D3. `memory-manager` 写 L2 带 scope；非 root 丢弃 L0/L1 候选
- [x] E1. `memory-store.getL2ForScope` / `getL2DmaeStatesForScope`
- [x] E2. `orchestrator/index.ts` L2 按 scope + L0/L1 按域开关
- [x] E3. `rag/index.ts` `searchMemoryEntries` / `addMemory` / `searchHistoryEntries` 按 scope
- [x] E4. `history-tools.ts` 写 scope + `recall_history` 读 scope（**先核对 ctx 可用性**）
- [x] E5. `relationship-log.ts` 加 scope
- [x] E6. `entity-graph.ts` 加 scope
- [x] E7. `moments` / `social-atoms` 限 owner 域
- [x] F1. `GeneralSettings.groupContextLimit` + 归一化 + 默认 10
- [x] F2. trace 带 `groupContextLimit`；`orchestrator` 消费
- [x] F3. 设置-记忆 UI 输入框 + 存取
- [x] H1. 侧边栏 `data-section="zones"` + `zones-panel` section
- [x] H2. `settings/zones/{dom,state,panel,picker}.ts`
- [x] H3. `zones-ipc.ts` + preload API
- [x] H4. 样式
- [x] I1. 删除旧"清空记录"（HTML/TS/dom/测试/i18n）
- [x] I2. 新增"删除全部记忆"卡片 + 二次确认弹窗 + 重启提示
- [x] J1. `classifyQqEvent` 加 `isGroupAllowed` 选项 + 适配器接线
- [x] J2. `qqbot-adapter` 同模式
- [x] J3. channels UI 移除白名单输入 + 迁移引导
- [x] 回归：`vitest run` 全绿 + 两个 tsconfig 零错误
- [ ] 手工验证 6 个场景（需真实 NapCat + 两个测试账号，尚未做）

> **施工进度**：§17 全部任务已完成（主进程 A–J + 渲染进程 F3/H/I/J3）。

---

## 18. 给 Agent 的提示

1. **先做 A/B/C**（无依赖），再 `D → E`（有依赖顺序），F/G/H/I/J 可并行。
2. **`recall_history` 的 ctx 是本阶段最大不确定点**——动手前先 `grep` 工具执行签名，确认能否拿到 `conversationId`。
3. **不要改 `formatChannelUserText`**（Phase 1 决策，群上下文块已提供说话人信息）。
4. **`roundCount` 保持全局**，只隔离 judge 的输入。
5. **桌面对话的 scope 直接返回 `zone:root`**（不做成员存储），简化实现。
6. **清空流程必须早于所有记忆初始化**。
7. **每完成一个任务就跑一次全量测试**，不要攒到最后。
8. 遇到与本蓝图不一致的真实代码，**以真实代码为准**并记录偏离原因（Phase 1 就是这么做的，效果很好）。

---

## 附录 A：完整文件清单

### 新建
```
src/main/zones/types.ts
src/main/zones/zone-store.ts
src/main/zones/zone-store.test.ts
src/main/zones/scope.ts
src/main/zones/scope.test.ts
src/main/zones/zones-ipc.ts
src/main/memory/memory-deletion.ts
src/main/memory/memory-deletion.test.ts
src/main/memory/memory-schema-gate.ts
src/main/memory/memory-schema-gate.test.ts
src/main/orchestrator/memory-scope-injection.test.ts
src/main/rag/scope-filter.test.ts
src/renderer/settings/zones/dom.ts
src/renderer/settings/zones/state.ts
src/renderer/settings/zones/panel.ts
src/renderer/settings/zones/picker.ts
```

### 修改
```
src/main/memory/memory-types.ts            (L2Memory.scope, MemoryCandidate.scope)
src/main/memory/memory-store-defaults.ts   (CURRENT_MEMORY_SCHEMA_VERSION = 3)
src/main/memory/memory-store.ts            (getL2ForScope, getL2DmaeStatesForScope)
src/main/memory/memory-manager.ts          (writeL2 带 scope；L0/L1 守卫)
src/main/memory/memory-scheduler.ts        (按 scope 分桶)
src/main/memory/memory-user-ipc.ts         (MEMORY_DELETE_ALL handler)
src/main/orchestrator/index.ts             (L2/L0/L1 scope；groupContextLimit)
src/main/orchestrator/build-options.ts     (trace 带 groupContextLimit；relationship scope；moments owner-only)
src/main/orchestrator/tools/history-tools.ts
src/main/rag/index.ts
src/main/relationship/relationship-log.ts
src/main/memory/entity-graph.ts
src/main/channels/adapters/qq/napcat-adapter.ts   (isGroupAllowed)
src/main/channels/adapters/qqbot/qqbot-adapter.ts
src/main/application/default-dependencies.ts      (schema gate 接入)
src/main/settings/general-settings.ts             (groupContextLimit)
src/main/settings/settings-facade.ts              (默认值 + 归一化)
src/shared/ipc-channels.ts                        (新 IPC 常量)
src/preload/index.ts                              (memoryPanel API 扩展)
src/renderer/settings/index.html                  (nav + zones panel + delete-all card - 旧清空记录)
src/renderer/settings/settings.ts                 (移除 clearChatHistory 绑定；导入 zones panel)
src/renderer/settings/general/dom.ts              (移除 clearChatHistoryBtn)
src/renderer/settings/memory/dom.ts               (groupContextLimit 输入)
src/renderer/settings/memory/panel.ts             (渲染/保存 groupContextLimit)
src/renderer/settings/settings.css                (zones 样式)
src/renderer/settings/i18n/zh-CN.json             (nav.zones, panel.zones.*, panel.memory.groupContext.*, panel.memory.deleteAll.*)
src/renderer/settings/mcp/panel.test.ts           (移除 clearChatHistoryBtn 断言)
```

---

## 19. 施工记录（实际落地与偏离）

> 本节由施工方在完成后追加，记录**与蓝图不一致处**及原因。原则同 Phase 1：遇到真实代码与蓝图冲突时**以真实代码为准**。

### 19.1 主进程（已完成）

| 蓝图 | 实际实现 | 原因 |
|---|---|---|
| `MemoryScopeId` 定义在 `zones/types.ts` | 同 | — |
| `resolveScopeId` 里桌面查 `findZoneByConversationId` | 桌面**直接返回 `zone:root`** | 采纳蓝图 §10.5「简化实现」：桌面隐式属于 root，不做成员存储，避免悬空引用 |
| `l2-dmae-manager.getActiveL2ForPrompt` 加 scope 仅用于 key 拼接 | 加 scope 做**防御性过滤**（`l2.scope === scopeId`） | 该管理器内部按 `l2Id` 索引，不需要 key 前缀；改成过滤才有实际防漏价值 |
| 闸门只返回 `"aborted"`，调用方自行退出 | 闸门返回 `"aborted"`，`startCore` 抛 `StartupAbortedError`（`code = E_STARTUP_ABORTED`），`application.ts` 识别哨兵**跳过错误框**直接受控退出 | 抛普通错误会让用户看到"Cyrene 启动失败"红框——用户只是选了退出，不是故障 |
| `ZoneStore` 一定落盘 | `zonesFilePath()` 取不到 userData 时返回 `null`，store 退化为**纯内存** | 与 `memory-trace.ts` 的既有约定一致；也让不 mock Electron 的单测可用 |
| `addExternalMember` 先移出旧成员再校验 root 上限 | **先校验后移出**，且同区块重复加入是幂等 no-op | 蓝图顺序会在校验失败时把旧成员挤掉，内存与磁盘不一致 |
| `MEMORY_TARGETS` 删除 `memory-trace.log` | 同，但删除后**立刻重建一条 `memory.deleteAll` 审计** | 所以该文件在删除后仍存在，属有意行为（测试已注明） |
| `deleteAllMemory()` 无参 | 增加可选 `DeleteAllMemoryDeps { userDataDir?, remove? }` | 提供确定性测试注入点（ESM 下无法 `vi.spyOn(fs, ...)`） |

### 19.2 蓝图未覆盖、施工中发现的跨域漏洞（已一并修复）

| 位置 | 问题 | 修复 |
|---|---|---|
| `memory-compressor.ts` `compressMemories()` | 聚类在**全局 L2** 上做 → 群聊记忆与桌面记忆会被合并成同一条总结，且总结**不带 scope**（既串味又从此召回不到） | 按 `scope` 分桶后再聚类；总结继承 `group[0].l2.scope` |
| `memory-compression-transaction.ts` | 未传递 scope | `CompressionTransactionInput.scope` + `createSummary(scope)` + `addSummaryVector(..., scope)` |
| `memory-store.ts` `applyConflictResolution` | 消解产生的新 L2 无 scope | 继承冲突双方的 scope（冲突检测已限域，两者同域） |
| `obsidian-importer.ts` 向量重建 | 回流后重建的向量丢 `metadata.scope` → 该条从此对域过滤不可见 | 沿用 `existing.scope` |
| `tool-registry.ts` `user_memory` / `read_memory` / `write_memory` | 蓝图 §8 未列出这三个工具（它们直接读写记忆） | 三者都按 `ctx.conversationId` 解析域：读只读本域、写给候选钉上域 |

### 19.3 蓝图最大不确定点的核实结论

> 蓝图 §8.5 / §18.2：「`recall_history` 的 execute 能否拿到 `conversationId`？」

**能。** `ToolContext`（`tools/registry/tool-context.ts`）已含 `conversationId`，且 `harness/adapter/tool-runtime.ts:67` 用 `options.conversationId ?? "default"` 构造。因此 `recall_history`、`user_memory`、`read_memory`、`write_memory` 四个工具都已接入域过滤，**没有退化为"不过滤"**。

### 19.4 有意保留的"不隔离"点

- `memoryStore.getAllL2()` / `getAllL2DmaeStates()` 仍保留，供管理面板（设置-记忆）、Obsidian 导出、全局衰减使用——它们不是注入路径。
- `rag.searchMemoryEntries(..., { scopeId: undefined })` 保持全库行为（旧调用方与导入文档检索）。
- `relationshipLog.buildContext()` 不传 scope 时仍全量，供管理面板使用。
- `entityGraph.feedEntityNamesToJieba()` 保持全局词典（分词词典无隐私语义）。
- `imported_doc`（导入文档）未加域：它只在 owner 路径（语音通话 / 主动聊天 / 桌面工具）被检索，渠道链路不调用。
- `channels/context-bindings.json` 保留不删：它管**消息映射**，与区块管**记忆域**是两件事（蓝图 §13）。

### 19.5 渲染进程（设置界面）的实际落地

| 蓝图 | 实际实现 | 说明 |
|---|---|---|
| `settings/zones/{dom,state,panel,picker}.ts` | 同，另加 `settings/shared/section-nav.ts` | 跨面板跳转（channels → zones）需要一个钩子，直接 import `settings.ts` 会成环 |
| 「删除全部记忆」二次确认 | 复用 `shared/modal.ts` 的 `showInputModal`，新增可选 `confirmValue`（严格相等门控，回车同样受控） | 不重复造弹窗；`showHtmlModal`/`showModal` 负责失败提示与重启提示 |
| 成员选择器列出 `externalChats` + `conversations` | **只列 `externalChats`** | 与「`kind:"desktop"` 只属于 root」的契约冲突：桌面对话在 root 卡片**只读**展示 |
| `data-i18n` 短 key 生效 | 实际**不生效**：`applyTranslations` 全仓无调用点，界面靠 HTML 中文兜底 | 两套都补齐：HTML 用短 key，资源文件与 `t()` 用 `settings.` 前缀 |
| `allowedGroupIds` 清空 | **不清空**：渲染进程保存配置时不带该字段，主进程 `saveChannelsSettings` 是子对象合并 → 旧值原样保留 | 与 §12.3「保留字段 + UI 引导迁移」一致；用户若确定要清，手工改 `channels-settings.json` 即可 |
| 群上下文条数归一化 | 渲染进程与主进程**有意差一处**：空输入回落 10（主进程 `Number("")===0` → 夹到 3） | 避免用户清空输入框后莫名变成 3 |

新增反馈元素 `#zones-feedback`（区块面板内联提示，后端校验错误如「root 区块只能有一个私聊映射」的落点）与
`#memory-group-context-status`（保存状态行）——这两个不在原模板里，若不需要可直接删除对应 DOM 与引用。

### 19.6 验收

见 §17 Checklist。回归门槛：`vitest run` 全绿 + `tsc -p tsconfig.main.json` / `tsconfig.preload.json` 零错误。

**实测结果**（Phase 2 完成后）：

| 项 | 结果 |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | **482 文件 / 4261 通过 / 1 跳过**（Phase 1.5 基线 469 文件 / 4132 通过，净增 13 文件 / 129 测试） |
| `tsc -p tsconfig.main.json --noEmit` | 0 错误 |
| `tsc -p tsconfig.preload.json --noEmit` | 0 错误 |
| `vite build` | 构建通过 |

**尚未做**：§14.3 的 6 个手工场景（需要真实 NapCat 与两个测试账号）、设置窗口的真机视觉验收。

## 20. 验收后修复：新群无法加白 + 新建区块弹窗乱码

Phase 2 交付后用户实测报了两个问题，都属于"验收漏了真实使用路径"，记录在此。

### 20.1 「新建区块」弹窗乱码（功能正常，纯显示 bug）

`showInputModal` 不传 `icon` 时执行的是 `iconEl.textContent = <svg …>…</svg>`：
默认图标是一段 **HTML**，却用 `textContent` 写进 DOM，于是整段标记被当普通文字渲染，
从弹窗左上角铺满整个面板（截图里的乱码就是它）。`showModal` / `showHtmlModal` 用的是
`innerHTML`，所以只有输入弹窗中招；「新建区块」「重命名区块」都走这条路。

- 修法：新增 `applyModalIcon(el, icon, fallback)` —— 以 `<` 开头的值走 `innerHTML`
  （项目内固定的 SVG 片段），否则走 `textContent`（emoji / 用户可控文本，不做 HTML 解析）；
  三个弹窗统一用它，默认铅笔图标提成常量 `DEFAULT_INPUT_MODAL_ICON`，markup 与运行时只有一份。
- 守卫：`src/renderer/settings/shared/modal-icon.test.ts` 断言"不传 icon 时渲染出 `<svg>` 元素、
  且可见文字里不含 `<svg`"，并覆盖 emoji / SVG 两种形态与"上一次图标不残留"。

### 20.2 全新的群无法加白（功能缺口）

群白名单并入区块（§12）时移除了「连接手机」里的群号输入框，但区块成员选择器的数据源是
`channels/context-bindings.json` 的 `externalChats` —— **只有已经产生过对话的会话**才会出现在里面。
于是"想给一个从没跟昔涟说过话的新群加白"这件事在 UI 上无路可走（旧输入框没了，选择器里也没有），
属于把入口删掉却没补上新入口。

- 补法：区块卡片新增「**手动加群**」→ 选渠道 → 填群标识。新增 IPC `zones:add-manual-group`。
- 关键实现点：**sessionId 由主进程用 `makeSessionId(channel, chatId)` 现算**，不接受渲染进程传入。
  渠道会话 id 是 `channel:<渠道>:<sha256(渠道:chatId) 前 16 位>`，Dispatcher 收到群消息时用同一个函数，
  只有两边一致，新群后续发言才会落进同一个记忆域（否则"加白了但记忆是另一个域"）。
- 校验规则放在 `src/shared/zone-group.ts`（渲染进程即时提示 + 主进程最后一道闸共用一份，
  避免"界面说合法、主进程拒绝"）：`qq` 认 5~12 位群号，`qqbot` 认群 openid 并**显式拒绝**群号形态的纯数字串
  （官方机器人只认 openid，填群号不会报错但永远匹配不上任何群，等于写死配置）。
  只开放 `qq` / `qqbot`：微信与飞书没有群白名单概念，列进来会给出"加了就能用"的错误暗示。
- 顺手补的显示细节：手动加的群一开始只有群号，成员行现在会回退到 `externalChats` 里的群名，
  群里说过话之后自动由"数字"变成"群名"。
- 守卫：`src/main/zones/zone-whitelist-wiring.test.ts` 把
  「手动加群 IPC → zones.json 成员 → adapter 放行判定」整条链路串起来断言
  （`classifyQqEvent` 由 drop 变 respond、qqbot openid 放行、渠道不串台、旧 `allowedGroupIds` 仍兼容）。
  为此把两个 adapter 里内联的群策略对象提成了 `qqGroupPolicyOptions()` / `qqBotGroupPolicyOptions()` ——
  之前那段接线在 `handleEvent` 私有方法里，测试碰不到，**白名单断链也不会有任何测试报警**，这次才有守卫。

**实测结果**（本次修复后）：

| 项 | 结果 |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | **486 文件 / 4313 通过 / 1 跳过**（Phase 2 基线 482 文件 / 4261 通过，净增 4 文件 / 52 测试） |
| `tsc -p tsconfig.main.json --noEmit` | 0 错误 |
| `tsc -p tsconfig.preload.json --noEmit` | 0 错误 |
| `vite build` | 构建通过 |

**仍未做**：真实 NapCat / QQ 官方机器人下的手工验证（手动加群 → 群里 @ 昔涟 → 真的回话）。

---

## 21. §14.3 手工验证记录（真机 NapCat + 真实 QQ 群）

检测手段：新增 `docs/construction/tools/phase2-verify.ps1`（`-Cmd runs|context|memory|files|zones|sessions|trace|settings`）。

**关键发现：`cyrene-runs/sessions/run-*.json` 里持久化了完整的 always-on 上下文**
（形如 `messages[i].visibility === "internal"` 的长 user 消息），所以「群上下文条数」「有没有 `[用户画像]`」
这两件事**不需要看屏幕或翻终端日志**，直接读运行记录即可判定。这是本阶段手测能落地的前提。

### 21.0 结论总表

| 场景 | 结论 | 一句话依据 |
|---|---|---|
| 1 升级清空 | ✅ 通过 | abort 时 `memory.json` 815 B / SHA256 / mtime **一字节未变**；确认后 `schemaVersion 2→3`、`rag-data` 与两个 channels 目录清空、`cyrene-chats/` 保留 |
| 2 区块隔离 | ✅ 通过 | 写入侧两条 L2 的 `scope` 精确为 `zone:zone_1790097334826_8ayo2d`；同区块两群共享；**跨区块群 Y 上下文完全干净** |
| 3 L0/L1 不外泄 | ✅ 通过 | `职业：顶级机密` **桌面注入有、群 X 注入无**（同一个值双向对照） |
| 4 群上下文条数 | ✅ 通过 | 设 3 → 7 条旁听里只注入最后 3 条；设 20 → 25 条旁听里注入正好 20 条 |
| 5 删除全部记忆 | ✅ 通过 | `failed: []`；`channels/history/`、`channels/archive/` 整个目录被删；`cyrene-chats/`（11.9 KB 会话）与 `zones.json`/`channels-settings.json` 保留 |
| 6 区块白名单 | ✅ 通过 | 无区块+无白名单 → `message_blocked`；**加进区块后（仍无白名单）正常响应**；移出后立刻回到拦截 |

**暴露的缺陷 4 项**：§21.4（`dailySummaries` 跨域串味，🔴 已实证内容包括桌面话题被昔涟在群里说出来）、
§21.6/§21.7（judge 不可观测 → 已补日志，并借此定位为 LLM 结构化输出 `REPAIR_EXHAUSTED`，非 Phase 2 问题）、
§21.9（`cyrene.log` 静默停止落盘）、以及 `stripSpeakerPrefix` 昵称含 `]` 打穿（见 §21.10）。

> **修复进度（§21.11）**：手测跑完后已修 **§21.4（缺陷 #1）** 与 **§21.10（缺陷 #2）**，均带回归测试；
> §21.6 已补日志（未在真机复验）；§21.9 仅记录。

**未覆盖**：① §8.4 `rag/index.ts` 按 scope 过滤 —— dev 环境无 embedding 模型（§21.8），只能靠单测；
② 设置界面暗色主题视觉；③ L2 的 `【相关记忆】` 注入块**从未真正触发过**（两条 L2 的 `weight=0`、
activation 未达阈值），所以 L2 注入路径只验证到"没漏"，没验证到"有东西时能正确注进去"。

### 21.1 场景 1：升级清空 —— ✅ 通过

| 步骤 | 判定依据 | 结果 |
|---|---|---|
| 保留 v2 文件启动 | 把 `memory.json` 的 `schemaVersion` 改成 2（815 B） | 启动弹「记忆格式升级」 |
| 选「退出应用」 | 无 electron 进程；`memory.json` **815 B / mtime 未变 / schemaVersion 仍为 2 / SHA256 一致**；`memory-trace.log` 无新增记录；`cyrene-chats`、`channels-settings.json`、`zones.json` 原样 | ✅ 文件一个字节没动，说明闸门**确实早于** `memoryStore.load()` / `initRAG()` |
| 选「退出应用」不弹错误框 | 应用日志只有 `fatal startup error: memory schema upgrade aborted by user`，无红框 | ✅ 走的是 `StartupAbortedError` 受控退出 |
| 选「清空记忆并继续」 | `memory.json` → `schemaVersion 3`、`l2=[]`、`evidence=0`；trace 新增 `memory.deleteAll` + `migration.zoneUpgrade{from:2,to:3}` + `store.init{schemaVersion:3}` | ✅ |
| `rag-data/memory-store.json` | 不存在 | ✅ |
| `channels/history/` 与 `channels/archive/` | 均不存在 | ✅ |
| `cyrene-chats/` | 仍在（`index.json` 保留） | ✅ |

**两个口径修正（蓝图原文判定标准会误判）**：

1. **`memory.json` 是懒创建的，不是启动瞬间重建**。清空后启动 57 秒时该文件**仍不存在**，直到
   `memoryStore.load()` 第一次被调用（本次为 01:13:06）才落盘。所以「重启后立刻查文件」会得到
   「清空失败」的假结论。**正确判定**：等 `memory-trace.log` 出现 `store.init` 再看文件。
2. **`rag-data/` 清空后会留一个空目录，`memory-store.json` 要等第一条向量写入才生成**
   （`JsonVectorStore.save()` 只在写操作里被调用）。所以「`memory-store.json` 不存在」是清空后的
   **正常稳态**，不是文件缺失。

### 21.2 场景 3：L0/L1 不外泄 —— ✅ 通过（两侧都验证）

L0 实测值：`occupation = "141115"`（用户填的测试值）。

| | 群 X（`zone:zone_1790097334826_8ayo2d`） | 桌面（`zone:root`） |
|---|---|---|
| `[用户画像]` | **✘ 无** | **✔ 有** |
| `职业` 值 | 未出现 | **`职业：141115`** |
| `[近期状态]` | ✘ 无 | ✘ 无 |
| `【群聊近期上下文】` | ✔ 3 条 | ✘ 无 |

对照组：同一个群在 Phase 2 之前的运行记录（09-22 23:59）是带 `[用户画像] [近期状态]` 的 —— 前后差异即修复生效的直接证据。

### 21.3 场景 4：群上下文条数 —— ✅ 通过（3 与 20 双向验证）

- 设置 `groupContextLimit = 3` 已落盘（`app-settings.json` mtime 01:21:51）。
- 群历史里 **7 条旁听消息**，本轮只注入 **最后 3 条**（`我想吃面` / `辣的` / `就这么说好了`），
  更早的 `你们决定没` 被正确截掉 → **确认是上限截断，不是"恰好只有 3 条"**。
- 改成 `20` 后（mtime 01:28:39），群历史 **25 条旁听**，本轮注入 **正好 20 条**（声明 20 / 实测 20），
  并且是**最后 20 条**（从 `辣的` 起算、被截掉的是更早的 `想好了吗` 等）→ 双向都成立。
- 注意 `buildGroupContextBlock` 只统计 `observedOnly`（**没 @ 昔涟的旁听消息**），所以喂数据必须发普通消息，
  光触发不旁听是攒不出来的。
- 设置入口是 `change` 事件保存：**只输入不回车/不切焦点不会落盘**（首次尝试时 `app-settings.json` 里根本没有
  `groupContextLimit` 这个键，用的是默认值 10）。

### 21.4 🔴→✅ 缺陷：`relationship-log` 的 `dailySummaries` 没有按域隔离（**已修，见 §21.11**）

`src/main/relationship/relationship-log.ts`

- `recordTurn()`（第 190-195 行）把当天**所有域**的 entries 汇总成一条、并按 `date` **覆盖写**进
  `data.dailySummaries` —— **全局每天只有一条**。
- `buildContext(scopeId)`（第 216-220 行）虽然过滤了 `entries`，但取摘要时**只按日期匹配**：
  `find(s => s.date === scoped.at(-1).date)` → 拿到的可能是**别的域**写的同一天摘要。

**后果**：桌面（root）当天聊的话题会通过「最近日记摘要」注入到群里。本次实测已能观察到该窗口：
01:18:49 群 X 写入后摘要内容是群里的；01:22:45 桌面说了句「HI」把当天摘要改写成
`下次回应提示：延续最近话题「HI」` —— 此后**任何**群 X 触发都会把 `HI` 带进群聊上下文。

**实测铁证**：01:29:38 在**桌面**说「我最近在学做菜」→ 01:32:50 群 X 那轮注入的
`【近期关系线索】/最近日记摘要` 里出现 `下次回应提示：延续最近话题「我最近在学做菜」`。
「我最近在学做菜」在群里从未出现过，属**跨域穿透**，与 `[用户画像]` 被正确拦在门外形成鲜明对比。

反向也成立：01:29:38 桌面那轮的摘要写的是群里的话题「这些数字加起来是多少」。因为查询只按 `date` 匹配，
**当天最后写入的那个域**决定了所有域看到的摘要。

**修法（已按此实现，见 §21.11）**：`dailySummaries` 改为按 `(scope, date)` 归属（或存进 entry 时把 summary 也按 scope 分桶），
`buildContext` 查自己域的那一条；同时 `nextCareCue` 的 `join("；")` 也应限定在域内（它目前跨域累积——
01:32:50 群 X 那轮的 `下次回应提示` 里混进了「我最近在学做菜」以外的多个域的话题）。
用户决定：**手测全部跑完再统一修**。

> 注：`nextCareCue` 的跨域累积在修完后**自动消失** —— `cues` 来自 `recent`，而 `recent` 本来就是按域过滤的
> `scoped.slice(-8)`。原文所说的"跨域累积"其实是同一现象的另一个表现：`entries` 过滤是对的，
> 但 `dailySummaries` 那一行把别域内容带了进来，看上去像 cue 在跨域累积。

### 21.5 附带确认（分域写入侧）

`relationship-log.json` 的 `entries` 已带 `scope`：实测 3 条记录分别为
`zone:zone_1790097334826_8ayo2d` ×2（QQ 群）与 `zone:root` ×1（desktop），写入侧分桶正确。

### 21.6 🔴 缺陷：judge 环节在磁盘上完全不可观测（已补日志）

手工验证卡在这里最久：`roundCount` 到 6（judge 触发点）、`l1.update` 一次不落，
但 `memory.json` 的 `l2` 仍是 0、`entity-graph.json` 也一直没生成。

问题是 **judge 有三条路径在磁盘上完全同形**：

| 路径 | 代码位置 | 磁盘痕迹 |
|---|---|---|
| LLM 调用失败被兜底 | `memory-judge.ts` 的 `catch` | 无 |
| LLM 返回 `candidates: []`（保守判定"不值得记"） | 同上，正常返回 | 无 |
| 候选被 `postFilterCandidates` 全部过滤掉 | 同上 | 无 |

三条路径都只写 `console`，而 `console` 只在 dev 终端里、不落盘；`memory-trace.log` 里
**根本没有 judge 环节的事件**。事后（以及线上）无法复盘"到底跑没跑、为什么没写"。

- 补法：`judgeRecentTurns` 新增三个 trace 事件 —— `judge.run`（进入判定，带轮数）、
  `judge.result`（原始候选数 / 过滤后保留数 / 实体数 / 各候选 layer）、
  `judge.error`（失败原因，含 missing api key 分支）。
- 注意 `entity-graph.json` 只在 **entities 非空** 时才落盘，所以"该文件不存在"**不能**当作
  "judge 没跑"的证据 —— 这也是排查时差点走偏的地方。

### 21.7 judge 判定失败的真正原因：结构化输出协议错误（非 Phase 2 问题）

补上 §21.6 的日志后当场抓到（`memory-trace.log`）：

```json
{"op":"judge.run","status":"ok","details":{"conversationId":"channel:qq:20b39082aa808213","turns":4}}
{"op":"judge.error","status":"error",
 "error":"Memory LLM [judge] protocol error: structured output failed: REPAIR_EXHAUSTED (stage: memory_judge)"}
```

dev 终端同步打印：

```
[PMRS/Judge] 分析最近 4 轮对话...
[StructuredOutput] stage=memory_judge perAttempt=60000ms totalBudget=120000ms maxAttempts=2
[PMRS/Judge] LLM 调用失败: MemoryLlmProtocolError: ... REPAIR_EXHAUSTED (stage: memory_judge)
[PMRS/Judge] 本轮无值得记录的信息
[LLMQueue] 完成: MemoryMaintenance 耗时=39737ms
```

结论：judge **确实跑了**，是 **LLM 结构化输出两次修复都失败**（2 次 attempt × 60s，总预算 120s）。
**与区块/作用域逻辑无关**，属模型端点（自定义端点 + `[B]gemini-2.5-pro`）对 judge 这套复杂 schema
（candidates/entities/slug/sourceQuote 多层嵌套）的协议兼容问题。换模型或降 schema 复杂度才可能过。

### 21.8 环境说明（**非缺陷**）：dev 版本未安装 embedding 模型 → RAG 不可用

dev 终端每一轮都打印：

```
[Memory/RAG] reconciliation skipped: vector store is not writable
[History] 索引对话失败: Error: RAG not initialized     (history-tools.ts:31 → rag/index.ts:186)
[PMRS/Manager] L2 已写入，但 RAG 同步失败: Error: RAG not initialized   (memory-manager.ts:136 → rag/index.ts:192)
[StickerEmbedding] Model not found. Sticker matching disabled.
[SceneEmbedding] bge-m3 model not found. Scene embedding disabled.
```

机械原因：`E:\AI_Chating\cyrene-agent\models` 是空目录（只有 `.gitignore`/`.gitkeep`），
`getEmbeddingProvider()` 返回 null → `initRAG()` 里 `provider = null`，而 `addMemory` /
`addL2MemoryVector` 第一行就是 `if (!store || !provider) throw new Error("RAG not initialized")`。

**这是 dev 环境的既定状态（用户确认："dev 版本目前没装这玩意"），不是 Phase 2 引入的回归。**
Phase 1 时期 `cyrene.log` 记过 `Provider: local-bge-m3 Dims: 1024`，模型当时是装好的，后来被清掉了。

受影响（仅限 dev 环境）：

| 能力 | 状态 |
|---|---|
| `searchMemoryEntries` 向量语义检索 | ❌ `if (!retriever) return []` |
| L2 向量同步 | ❌ 全部 `syncStatus=sync_failed`，`ragId` 为空 |
| `recall_history` / 对话索引 | ❌ |
| `rag-data/memory-store.json` | ❌ 永不生成（不是"被清空了没重建"，是从没写过） |
| **L2 按域注入**（`memory.json` 直读 + scope 过滤） | ✅ **不受影响** |

**对手测结论的影响**：向量召回路径不可用，因此场景 2 的「群 Y 不知道 / 群 X 知道」只能通过
**L2 注入路径**验证。而这恰好是 Phase 2 第 8.2 节改动的核心路径，验证依然有效 ——
只是覆盖不到 §8.4（`rag/index.ts` 按 scope 过滤）那条，那条只能靠单测（`src/main/rag/scope-filter.test.ts`）。

### 21.9 附带发现：`cyrene.log` 在受限启动后不再写入

`logs/cyrene.log` 共 36 行，最后一条是 `2026-09-23 01:08:40 ERROR Runtime fatal startup error: memory schema upgrade aborted by user`。
此后 01:11、01:44 两次正常启动 + 十余轮渠道运行**都没有写进这个文件**，而 `memory-trace.log`
正常追加。也就是说**应用主日志在某个时间点静默停止落盘**，排查只能靠 dev 终端（不落盘）。
这与 §21.6 是同一类可观测性缺口，值得单独查。

### 21.10 🔴→✅ 缺陷：群昵称含 `]` 会打穿发送者前缀剥离（**已修，见 §21.11**）

`src/main/channels/channel-context.ts:123-125`

```ts
function stripSpeakerPrefix(text: string): string {
  return text.replace(/^\[群聊发送者：[^\]\n]+\]\n?/, "");
}
```

对 `[群聊发送者：[b°t]BEIKIA (2914636187)]\n111`：`[^\]\n]+` 贪婪吃到 `[b°t` 撞上昵称内部的 `]`，
**pattern 里的 `\]` 正好匹配了那个内部 `]`**，于是只剥掉 `[群聊发送者：[b°t]`，剩下
`BEIKIA (2914636187)]\n111` —— 实测落在
`channels/history/channel_qq_9cdd5e32b57efa9e.jsonl` 里，逐字节吻合。

**影响两条路径**：
1. 滑动窗口（`bootstrap.ts:181-189` 把说话人重新拼回）→ 模型收到
   `[[b°t]BEIKIA]: BEIKIA (2914636187)]\n111`，**括号残缺的碎片粘在用户话前面**
2. 绑定桌面会话（`bootstrap.ts:121-131` 不带 speaker 字段）→ 直接注入 `BEIKIA (2914636187)]\n111`，**发送者信息全丢**

**已污染到下游**：`memory.json` 里两条 L2 的 `triggerText` 就是
`[群聊发送者：AIKIEB (2914636187)]\n记住这两件事哦` —— 说明这个残缺前缀会顺着记忆链路继续传播。

**测试盲区**：`channel-context.test.ts:202,234` 与 `history-log.test.ts:481` 的断言是
`expect(content).not.toContain("[群聊发送者：")` —— **部分剥离也能通过**（中文头确实没了）。
没有任何测试用带 `]` 的昵称。

**修法（已逐例验证，未落地）**：把终止符锚定到首行最后一个 `]`：

```ts
// channel-context.ts:124
return text.replace(/^\[群聊发送者：[^\n]*\]\n?/, "");
```

`history-log.ts:64` 的 `LEGACY_SPEAKER_PREFIX` 有同一缺陷，一并镜像改为 `^\[群聊发送者：([^\n]*)\]\n?…`
（此时 group1 = `[b°t]BEIKIA (2914636187)`，`parseLegacySender` 能正确拆出 name/id）。
注意贪婪 `([^\n]*)` 对**历史遗留的无换行记录**（`[群聊发送者：小明 (10001)]你好[图]`）会多吞正文 ——
`formatChannelUserText` 恒定输出 `\n`，所以只影响旧数据。
两个文件都应补一条 `senderName = "[b°t]BEIKIA"` 的用例断言完整剥离。

> ⚠️ **上面这个"贪婪 `[^\n]*`"的修法实测是错的，不要照抄** —— 已改用 lookahead 锚点，见 §21.11。
> 贪婪版对无换行的旧记录会一路吞到最后一个 `]`，把用户正文吃掉。

---

## 21.11 缺陷 #1 / #2 修复记录（手测跑完后落地）

修的是 §21.4（`dailySummaries` 跨域串味）与 §21.10（昵称含 `]` 打穿前缀剥离）。
两处都走"**先写回归测试 → 确认在旧代码上必须失败 → 再改实现**"，避免改完才发现测的是别的东西。

### 21.11.1 缺陷 #1：`dailySummaries` 按 `(scope, date)` 分桶

`src/main/relationship/relationship-log.ts`

| 位置 | 旧行为 | 新行为 |
|---|---|---|
| `RelationshipDailySummary` | 无 `scope` | 新增可选 `scope`（`undefined` = Phase 2 之前的 legacy 摘要） |
| `summarizeDate()` | 只按 `date` 汇总同一天**所有域**的 entries | 新增 `scope` 参数，只汇总本 `(scope, date)` 桶；`scope === undefined` 时不写该字段，落盘形态与 legacy 一致 |
| `recordTurn()` 写摘要 | `filter(item => item.date !== entry.date)` —— 一天一条、**按 date 覆盖** | `filter(item => !(item.date === entry.date && (item.scope ?? undefined) === (entry.scope ?? undefined)))` —— **按 (scope, date) 覆盖** |
| `buildContext(scopeId)` 读摘要 | `find(s => s.date === scoped.at(-1).date)` —— 只按日期，**可能取到别域的** | 新增 `findDailySummary(data, date, scope)`：先精确匹配 `scope`；只有本域当天没有任何带 `scope` 的摘要时，才回退到同日的 legacy 摘要 |
| `buildContext()` 全量模式 | `dailySummaries.at(-1)` | 优先取最近一条 **legacy（无 scope）** 摘要，取不到再退回 `at(-1)` —— 保持管理面板/旧测试的升级前语义 |

**legacy 兼容口径**（升级后当天不空档，但绝不跨域复用）：

| 当日摘要现状 | `buildContext("zone:groupA")` 取到 |
|---|---|
| 有 `zone:groupA` 的 | ✅ 本域的 |
| 无本域的，只有 legacy（无 scope） | ✅ legacy 那条（**仅此一种回退**） |
| 无本域的，但有别的域的 | ❌ 不注入（**不会拿 `zone:groupB` 的顶替**） |

§21.4 里提到的 `nextCareCue` 跨域累积**不需要单独修**：`cues` 取自 `recent`，而 `recent` 一直是按域过滤的
`scoped.slice(-8)`；之前看到的"多域话题混在一起"是 `最近日记摘要` 那一行带进来的。

**回归测试**（`relationship-log.test.ts` 新增 5 条，改实现前 3 条失败）：

- 同一天的桌面摘要不会串进群聊上下文（**核心断言**：群上下文 `not.toContain("我最近在学做菜")`）
- `nextCareCue` 累积按域分桶（群里那行提示不含桌面话题）
- 同一天两个域各存一条摘要、各自带 `scope`（旧实现这里是 `expected length 2 but got 1`）
- legacy 无 scope 摘要按日期兜底，但不覆盖已分桶的新摘要
- 无 scope 的轮次不被伪造成某个域，全量模式行为不变

**实测升级路径**（额外用真机形态的 fixture 验过一遍，验证后已删除临时用例）：
Phase 2 的 `entries`（带 scope）+ 缺 `scope` 的 legacy `dailySummaries` 同时存在时 ——
①本域暂无摘要 → 回退 legacy；②本域写一条新记录 → 摘要改建本域桶、不再含 legacy 内容；③别的域查不到它；④全量模式仍读得到 legacy。

### 21.11.2 缺陷 #2：昵称含 `]` 的前缀剥离

`src/main/channels/channel-context.ts` + `src/main/channels/history-log.ts`

**关键坑**：正则的"惰性"和"贪婪"在这里都不对，必须换思路。

| 尝试 | 结果 |
|---|---|
| 旧：`[^\]\n]+` | ❌ 在昵称内部的 `]` 收尾 → 残片 `BEIKIA (2914636187)]\n111` |
| 惰性有界：`[^\n]{0,300}?` | ❌ **照样错** —— 正则引擎优先取**最早**的 `]`，惰性只是"在能满足 pattern 的前提下取最短"，昵称内部那个 `]` 正好能满足 |
| 贪婪：`[^\n]*`（§21.10 原提案） | ⚠️ 能过本轮用例，但对**无换行的旧记录**会一路吞到最后一个 `]`，把用户正文吃掉 |
| ✅ lookahead 锚点 | 把"分隔 `]`"锚定成**行尾 / `(数字)` 之前**，昵称内部的 `]` 不满足锚点被跳过；惰性保证正常昵称仍在第一个 `]` 收尾 |

落地实现：

```ts
// channel-context.ts —— 写入侧：只砍前缀，保留触发提示行 / 引用行
//   入参恒为 formatChannelUserText 的输出（新格式），故不需要兼容 legacy 标记
return text.replace(/^\[群聊发送者：[^\n]{0,300}?\](?=\n|$|\(\d{1,32}\))\n?/, "");

// history-log.ts —— 读取侧：前缀 + 触发标记 + 关键词提示行 一起结构化掉
const LEGACY_SPEAKER_PREFIX =
  /^\[群聊发送者：([^\n]{0,300}?)\](?=\n|$|\(\d{1,32}\)|\(@昔涟\)|\(触发词\))\n?(?:\((?:@昔涟|触发词)\)\n?)?(?:\[本条消息命中触发关键词[^\]]*\]\n?)?/;
```

两条路径的 lookahead 不同是**故意的**：写入侧只剥发送者行（关键词提示行是正文语义，必须留在 body 里给模型看），
读取侧则要把提示行收进结构化字段 `triggered`。实测 11 组格式（含 `[a]b[c]d` 多括号昵称、无 QQ 号、
legacy `(@昔涟)`/`(触发词)`、带引用、命中触发词）两条路径的 span 全部正确。

**回归测试**（3 条，改实现前全部失败，失败信息逐字复现了残留碎片）：

- `channel-context.test.ts`：昵称含 `]` 时仍完整剥掉发送者前缀（断言 `content === "111"` 且绑定会话的 `modelContext` 干净）
- `channel-context.test.ts`：昵称含 `]` 且带引用 / 触发提示时，只剥前缀不伤正文
- `history-log.test.ts`：旧格式昵称含 `]` 时仍能拆出 `speakerName = "[b°t]BEIKIA"` + `speakerId = "2914636187"` + 纯正文

> 原测试盲区（§21.10）也一并堵上：旧断言是 `not.toContain("[群聊发送者：")`，**部分剥离也能通过**；
> 新断言直接比对完整正文内容。

### 21.11.3 验证与落地状态

- 改动前：3 条新用例失败，失败输出 = `"BEIKIA (2914636187)]\n引用 小红：前一条\n你好"`、`speakerName = "[b°t"`、`expected length 2 but got 1`
- 改动后：相关 7 个测试文件 **148 通过**
- 全量单测：**486 文件 / 4321 通过 / 1 skipped / 0 失败**；`tsc -p tsconfig.main.json` **0 错误**
- `dist/main` 已重新编译（`npm run dev` 重启后生效）
- 真机 userData 未受测试污染（当时 `relationship-log.json` 仍不存在 —— 场景 5 清空后的正常稳态，应用下次写入时按新格式重建）

**真机复验已完成 → 见 §21.12**（两条缺陷都在真机拿到前后对照证据，含"最强版"跨域断言）。

---

## 21.12 缺陷 #1 / #2 修复的真机复验记录（结论：两条都通过）

时间：2026-09-24 00:15 ~ 00:25（应用于 00:02:59 启动，跑的是 00:02:55 编译的修复版 `dist`）。
检测器：`docs/construction/tools/phase2fix-verify.mjs`（新增，7 个只读模式；Node 实现，避开本机禁用脚本执行策略 + PS5 ANSI 乱码两个坑）。

### 21.12.1 复验用的三个域

**没有改动任何配置文件**，利用的是场景 5/6 之后的自然状态，三个域两两不同：

| 会话 | 域 | 白名单来源 |
|---|---|---|
| 桌面 | `zone:root` | 隐式（桌面对话 id 非 `channel:` 前缀 → `resolveScopeId` 直接回 root） |
| 群 X `543627098` | `solo:channel:qq:20b39082aa808213` | 旧 `allowedGroupIds` |
| 群 Y `1055799748` | `zone:zone_1790180458851_af9bq2` | 区块「1」（场景 6 曾把它从旧白名单剥离，靠加区块恢复） |

> 关于群 X 为什么**故意留在 solo**：若把 X 和 Y 放进同一个区块，验证就退化成"同区块共享"而非"跨域隔离"（§21.11 之前误判过一次）。
> X 留 solo 也顺带证明了 `solo:…` → `zone:root` 与 `solo:…` → `zone:<其他区块>` 两个方向都不串。

### 21.12.2 缺陷 #1：分桶 + 读取隔离

`relationship-log.json`（场景 5 删除后**首次重建**，4 轮写入累积 3 个域）：

| 时间 | scope | 正文 | 摘要桶 |
|---|---|---|---|
| 00:15:30 | `zone:root` | `我在写小说` | ← root 桶 |
| 00:16:41 | `zone:root` | `你猜呀` | root 桶更新 |
| 00:18:20 | `solo:…20b39082aa808213` | `周末想去爬山` | ← 群X 桶 |
| 00:21:28 | `zone:zone_1790180458851_af9bq2` | `123` | ← 群Y 桶 |
| 00:24:22 | `solo:…20b39082aa808213` | `山上有雪吗` | 群X 桶更新 |

**同日 `2026-09-24` 存在 3 条摘要且 `(scope,date)` 无重复** —— 旧实现按 `date` 覆盖写，**无论如何只可能有 1 条**，这是分桶落地最直接的形态证据。

**最强版跨域断言**（00:24:22 群 X 那轮，此时当天已有 3 个桶，任一环节漏了都会串味）：

```
【近期关系线索】
- 用户最近状态：平稳
- 最近日记摘要：2026-09-24：… 下次回应提示：延续最近话题「[群聊发送者：AIKIEB (2914636187)] 周末想去爬山」
- 下次回应提示：下次回应提示：延续最近话题「[群聊发送者：AIKIEB (2914636187)] 周末想去爬山」…
```

读到的**是群 X 自己 00:18:20 的那条**（`周末想去爬山`），而当天最新的全局写入是群 X 自己 00:24:22 的 `山上有雪吗`、
桌面桶是 `你猜呀`、群 Y 桶是 `123` —— **三者都没出现**。

**探针词串味矩阵**（在全部 5 个 run 的 always-on 上下文里搜 6 个探针词）：

| run 时间 | 会话 | 命中 |
|---|---|---|
| 00:24:22 | 群 X | `周末想去爬山`（本域自己的） |
| 00:21:28 | 群 Y | **无** |
| 00:18:20 | 群 X | **无** |
| 00:16:41 | 桌面 | `我在写小说`（本域自己的） |
| 00:15:30 | 桌面 | **无** |

零跨域命中。§21.4 的原始症状（桌面 `我最近在学做菜` 进群）在真机链路上不再复现。

### 21.12.3 缺陷 #2：昵称含 `]`

同一个真实昵称 `[b°t]BEIKIA`，新旧正则在本机的等价对比：

```
输入:      [群聊发送者：[b°t]BEIKIA (2914636187)]\n123
旧正则 →   BEIKIA (2914636187)]\n123        ← §21.10 的残片症状
新正则 →   123
```

**磁盘实证**（`channels/history/channel_qq_9cdd5e32b57efa9e.jsonl` 原始行）：

```json
{"role":"user","content":"123","speakerId":"2914636187","speakerName":"[b°t]BEIKIA","isBot":false,"triggered":true}
```

`content` 无未剥离前缀，`speakerName` 完整。同一群当时还有另外两类特殊昵称，**全部干净**：
`〔b0t〕我也要当机器人喵`（全角 `〕`×2，4 条）、`[b0t]Noimpty` / `[b0t]牢大`（半角 `]`）、`红` / `Neurax禾苗`（无括号）—— 共 26 条。

**注入侧实证**：群 Y（00:21:28）渲染为 `[Neurax禾苗]: [image]`；群 X（00:24:22）本轮 user 消息为
`[群聊发送者：AIKIEB (2914636187)]\n山上有雪吗`（前缀完整、正文干净）。

**关系日志侧实证**：`userText` 为 `[群聊发送者：[b°t]BEIKIA (2914636187)] 123` —— 昵称完整，不是残片。

### 21.12.4 一个**不是缺陷**的预期现象（免得下次误判）

`relationship-log.json` 的 `entries[].userText` **会带** `[群聊发送者：…]` 前缀，这是设计使然：
关系日志存的就是 `formatChannelUserText()` 的输出（模型侧文本），而 `sideEffectUserText` 取自
`latestUserText`（`build-options.ts:496` / `:973`），群聊形态天然带前缀。
所以下次看到关系日志里有前缀、而 `channels/history` 的 `content` 里没有前缀，**两边都是对的** ——
"无前缀"是写入侧（`appendIncomingContext` → `stripSpeakerPrefix`）的契约，不是关系日志的契约。

### 21.12.5 复验未覆盖项

- **`【相关记忆】`（L2 按域注入）依然从未真正触发**（承接 §21.11 的覆盖缺口）：本次 L2 全程为 0 条，
  因为 dev 版无 embedding 模型（§21.8）→ RAG 未初始化 → judge 的结构化输出又失败（§21.7），
  L2 只能靠模型主动 `write_memory`，本轮没触发。该路径仍只有单测 `rag/scope-filter.test.ts` + `memory-scope-isolation.test.ts` 兜着。
- **judge 的 trace 日志**（§21.6 补的那条）在本轮未再复现：`memory.json` 的 `l1.roundCount` 全程未达 6 的倍数。

