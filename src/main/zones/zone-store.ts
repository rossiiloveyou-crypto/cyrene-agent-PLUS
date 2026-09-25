// 区块存储 —— zones.json 的读写与约束校验。
//
// 约束（服务端强制，UI 只是提示）：
//   - root 区块有且只有一个，不可删除、不可改名
//   - root 区块最多 1 个私聊成员（保持「桌面 ↔ 私聊」一对一镜像语义）
//   - 一个外部会话同一时刻只属于一个区块：加入新区块时自动从旧区块移出
//
// state 是进程内缓存；所有写操作都走本类方法（内部 persist()），
// 因此正常运行期不存在"外部改文件"的一致性窗口。

import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import { ROOT_ZONE_ID, type Zone, type ZoneMember, type ZoneStoreData } from "./types";

const STORE_VERSION = 1;

/**
 * zones.json 路径。
 *
 * Electron 主进程外（单测等）`app` 可能不存在 → 返回 null，此时 store 退化为
 * **纯内存**（load 给 emptyState，persist 空操作），与 memory-trace 的处理一致。
 */
function resolveZonesFilePath(): string | null {
  try {
    const dir = app?.getPath("userData");
    return dir ? path.join(dir, "zones.json") : null;
  } catch {
    return null;
  }
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

function emptyState(): ZoneStoreData {
  return { version: STORE_VERSION, zones: [createRootZone()] };
}

/** 区块名校验：1~64 字符，去掉首尾空白；非法时回退到 fallback。 */
export function normalizeZoneName(input: unknown, fallback: string): string {
  const s = typeof input === "string" ? input.trim() : "";
  return s.length > 0 && s.length <= 64 ? s : fallback;
}

export class ZoneStore {
  private state: ZoneStoreData | null = null;

  constructor(private readonly filePath: string | null = resolveZonesFilePath()) {}

  /** 读取。首次读取时保证 root 区块存在且唯一。 */
  load(): ZoneStoreData {
    if (this.state) return this.state;
    if (!this.filePath) {
      this.state = emptyState();
      return this.state;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<ZoneStoreData>;
      if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.zones)) {
        this.state = emptyState();
      } else {
        const zones = parsed.zones.filter(isZone);
        const roots = zones.filter((z) => z.isRoot);
        // root 缺失或重复 → 整个 store 视为损坏，重建（绝不留下"无根"状态）
        this.state = roots.length === 1 ? { version: STORE_VERSION, zones } : emptyState();
      }
    } catch {
      this.state = emptyState();
    }
    return this.state;
  }

  private persist(): void {
    const state = this.load();
    if (!this.filePath) return;
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

  /** 按桌面对话 id 反查所属区块（桌面默认只在 root）。 */
  findZoneByConversationId(conversationId: string): Zone | null {
    for (const zone of this.load().zones) {
      if (zone.members.some((m) => m.kind === "desktop" && m.conversationId === conversationId)) {
        return zone;
      }
    }
    return null;
  }

  createZone(input: { name?: unknown; zoneId?: string } = {}): Zone {
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

  /** 重命名。root 名字固定，忽略改名请求。 */
  renameZone(zoneId: string, name: unknown): Zone | null {
    const state = this.load();
    const zone = state.zones.find((z) => z.zoneId === zoneId);
    if (!zone) return null;
    if (zone.isRoot) return cloneZone(zone);
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
      // root 固定注入 owner 画像：关掉它会让桌面聊天失去画像，不是用户想要的语义
      if (!zone.isRoot) zone.config.injectOwnerProfile = patch.injectOwnerProfile;
    }
    this.persist();
    return cloneZone(zone);
  }

  /** 删除区块（root 不可删）。成员回到"独立域"，不自动迁移数据。 */
  deleteZone(zoneId: string): boolean {
    const state = this.load();
    const zone = state.zones.find((z) => z.zoneId === zoneId);
    if (!zone || zone.isRoot) return false;
    state.zones = state.zones.filter((z) => z.zoneId !== zoneId);
    this.persist();
    return true;
  }

  /**
   * 把一个外部会话加入区块。
   * 该成员会先从所有区块移出（保证"同一时刻只属于一个区块"）。
   * root 区块的私聊上限为 1。
   */
  addExternalMember(zoneId: string, member: ZoneMember): Zone | null {
    const state = this.load();
    const zone = state.zones.find((z) => z.zoneId === zoneId);
    if (!zone) return null;
    if (member.kind !== "external") throw new Error("only external members can be added here");

    const key = memberKey(member);
    // 已经在本区块：幂等返回，不触发下面的 root 私聊上限校验
    if (zone.members.some((m) => memberKey(m) === key)) return cloneZone(zone);

    // 上限校验必须在移除旧成员之前做：否则校验失败时旧成员已被移出，内存与磁盘会不一致
    if (zone.isRoot && member.chatType === "private") {
      const existingPrivates = zone.members.filter(
        (m) => m.kind === "external" && m.chatType === "private",
      );
      if (existingPrivates.length >= 1) {
        throw new Error("root 区块只能有一个私聊映射");
      }
    }

    removeMemberByKey(state, key);
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

  /** 查询所有"已在区块中"的外部 sessionId（供 scope 判定复用）。 */
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

export function memberKey(m: ZoneMember): string {
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

/** 测试用：替换/重置单例。 */
export function _resetZoneStoreForTest(store: ZoneStore | null = null): void {
  defaultStore = store;
}
