import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import type { ChannelChatType } from "./types";

const STORE_VERSION = 1;
const DEFAULT_MAX_EXTERNAL_CHATS = 200;
const OBSERVATION_WRITE_INTERVAL_MS = 5_000;

export interface ExternalChannelChat {
  sessionId: string;
  /** 渠道 id；内置四渠道之外还包括插件注册的动态渠道（如 minecraft）。 */
  channel: string;
  chatId: string;
  chatType: ChannelChatType;
  senderName?: string;
  lastAt: number;
}

/**
 * 磁盘结构。
 *
 * ⚠️ 旧版本还会写一个 `bindings` 字段（渠道会话 ↔ 桌面对话的镜像绑定）。
 * 该功能已删除：这里刻意**不声明** `bindings`，让读取时的 `JSON.parse` 结果
 * 天然忽略旧 key（多一个未知字段不会报错），并且下一次 `persist()` 写回时
 * 它会自动消失 —— 即"旧配置多一个 key 应被忽略而非报错"。
 */
interface PersistedBindingState {
  version: typeof STORE_VERSION;
  externalChats: ExternalChannelChat[];
}

export interface ChannelConversationBindingSnapshot {
  externalChats: ExternalChannelChat[];
}

function emptyState(): PersistedBindingState {
  return { version: STORE_VERSION, externalChats: [] };
}

/** 渠道 id 校验：内置渠道（wechat/feishu/qq/qqbot）之外，插件可注册
 *  动态渠道 id（经 plugin-runtime 注入），因此只做长度与格式约束。 */
function isChannelId(value: unknown): value is string {
  return typeof value === "string"
    && /^[a-z][a-z0-9_-]{0,31}$/.test(value);
}

function isExternalChat(value: unknown): value is ExternalChannelChat {
  if (!value || typeof value !== "object") return false;
  const chat = value as Partial<ExternalChannelChat>;
  return typeof chat.sessionId === "string"
    && chat.sessionId.length > 0
    && chat.sessionId.length <= 128
    && isChannelId(chat.channel)
    && typeof chat.chatId === "string"
    && chat.chatId.length > 0
    && chat.chatId.length <= 256
    && (chat.chatType === "private" || chat.chatType === "group")
    && (chat.senderName === undefined || (typeof chat.senderName === "string" && chat.senderName.length <= 256))
    && typeof chat.lastAt === "number"
    && Number.isFinite(chat.lastAt);
}

/**
 * 见过的外部会话观察记录（`channels/context-bindings.json`）。
 *
 * 这是「记忆区块成员选择器」的唯一数据源，也是手动加群后补全群名的来源 ——
 * 删掉它区块就选不出成员了。历史上它还存过"渠道会话 → 桌面对话"的镜像绑定，
 * 那部分已随镜像功能一并删除，见 PersistedBindingState 的注释。
 */
export class ChannelConversationBindingStore {
  private state: PersistedBindingState | null = null;
  private dirty = false;
  private lastPersistAt = 0;

  constructor(
    private readonly filePath: string,
    private readonly maxExternalChats = DEFAULT_MAX_EXTERNAL_CHATS,
  ) {}

  observe(chat: ExternalChannelChat): void {
    if (!isExternalChat(chat)) throw new Error("Invalid external chat");
    const state = this.load();
    const previous = state.externalChats.find((item) => item.sessionId === chat.sessionId);
    const metadataChanged = !previous
      || previous.channel !== chat.channel
      || previous.chatId !== chat.chatId
      || previous.chatType !== chat.chatType
      || previous.senderName !== chat.senderName;
    const externalChats = state.externalChats.filter((item) => item.sessionId !== chat.sessionId);
    externalChats.push({ ...chat });
    // 上限只淘汰最久未活跃的观察记录（历史上"已绑定会话优先保留"的裁剪逻辑
    // 随镜像绑定一起删除，现在统一按最近活跃排序）。
    externalChats.sort((a, b) => b.lastAt - a.lastAt);
    state.externalChats = externalChats.slice(0, this.maxExternalChats);
    this.dirty = true;
    const now = Date.now();
    // 仅合并显示时间戳；新聊天与元数据变更仍立即落盘。
    if (metadataChanged || now < this.lastPersistAt || now - this.lastPersistAt >= OBSERVATION_WRITE_INTERVAL_MS) {
      this.persist();
    }
  }

  flush(): void {
    if (this.dirty) this.persist();
  }

  list(): ChannelConversationBindingSnapshot {
    const state = this.load();
    return {
      externalChats: state.externalChats.map((chat) => ({ ...chat })),
    };
  }

  /**
   * 忘掉若干会话观察记录并落盘（P3 擦除某人）。
   *
   * ⚠️ 调用方只允许传**私聊** sessionId：`externalChats` 同时是「记忆区块成员选择器」的
   * 唯一数据源，群记录被删掉就等于区块选不出群了。本方法本身只按 sessionId 精确删除，
   * 不做 chatType 判断也不做模糊匹配 —— 剩下的记录（尤其是群）原样保留并立即 persist()。
   * 返回实际移除的条数；一个都没命中时不落盘（无脏写）。
   */
  forget(sessionIds: readonly string[]): number {
    if (sessionIds.length === 0) return 0;
    const doomed = new Set(sessionIds);
    const state = this.load();
    const before = state.externalChats.length;
    state.externalChats = state.externalChats.filter((chat) => !doomed.has(chat.sessionId));
    const removed = before - state.externalChats.length;
    if (removed > 0) this.persist();
    return removed;
  }

  private load(): PersistedBindingState {
    if (this.state) return this.state;
    try {
      // 旧文件可能带 bindings 字段；这里只校验自己认识的字段，多余 key 直接忽略。
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<PersistedBindingState>;
      if (parsed.version !== STORE_VERSION
        || !Array.isArray(parsed.externalChats)
        || !parsed.externalChats.every(isExternalChat)) {
        this.state = emptyState();
      } else {
        this.state = {
          version: STORE_VERSION,
          externalChats: [...parsed.externalChats]
            .sort((a, b) => b.lastAt - a.lastAt)
            .slice(0, this.maxExternalChats),
        };
      }
    } catch {
      this.state = emptyState();
    }
    return this.state;
  }

  private persist(): void {
    this.dirty = true;
    const state = this.load();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(temporaryPath, this.filePath);
    this.dirty = false;
    this.lastPersistAt = Date.now();
  }
}

let defaultStore: ChannelConversationBindingStore | null = null;

export function getChannelConversationBindingStore(): ChannelConversationBindingStore {
  if (!defaultStore) {
    defaultStore = new ChannelConversationBindingStore(
      path.join(app.getPath("userData"), "channels", "context-bindings.json"),
    );
  }
  return defaultStore;
}
