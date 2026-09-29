// Settings 公共类型定义
// 从 settings.ts 抽离的跨面板共享类型。
// 注意路径深度：本文件位于 src/renderer/settings/shared/，
// 到 src/shared/ 需要 ../../../shared/，到 settings/ 下其他模块用 ../

import type { ApiTransport } from "../../../shared/api-endpoint";
import type { ReasoningPreference } from "../../../shared/reasoning";
import type { UiTheme } from "../../../shared/ui-theme";
import type { UiFont } from "../../../shared/ui-font";
import type { UiIcon } from "../../../shared/ui-icon";
import type {
  DefaultChatMode,
  MobileMessageSegmentationMode,
  ProactiveChatMode,
  ProactiveDeliveryTarget,
  SegmentedOutputMode,
} from "../../../shared/preferences";
import type { QqListenAuthRequirement } from "../../../shared/qq-listen";
import type { CustomStyleConfig } from "../../../shared/style-sampling";
import type { BuiltinProviderId } from "../../../shared/vendor-registry";
import type { CustomEndpointMode } from "../custom-endpoint-state";
import type { TimeoutSettings } from "../../../shared/timeout-types";

/**
 * 预设与厂商注册表的静态关联键：真实厂商用注册表推导的 BuiltinProviderId
 * （写错编译期即报），自定义端点伪条目用 custom 两 id。
 * import type 纯类型引入，零运行时开销。过渡态：用户已保存配置的存储键
 * 仍是 displayName（providerName），本类型只用于 presets 静态数据关联。
 */
export type ModelPresetProviderId = BuiltinProviderId | "custom-cloud" | "custom-local";

export interface ProviderProfile {
  baseUrl: string;
  model: string;
  apiKey: string;
  displayName?: string;
  /**
   * 用户在 settings 显式选择的协议。旧配置中的 auto 会由 main 进程迁移为具体值。
   */
  explicitTransport?: ApiTransport;
  reasoning?: ReasoningPreference;
}

export interface ModelSettings {
  mode: "auto" | "manual";
  provider: string;
  // 用户给模型起的自定义昵称，留空时用厂商 shortName。状态栏"正在喂养"显示它。
  displayName?: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  /**
   * 当前厂商的 explicitTransport 镜像（顶层字段是 main 进程 perProvider[currentProvider] 的视图）。
   * UI 改动 transport-select 时，saveConfig 把这个值带给 main 进程折叠回 perProvider。
   */
  explicitTransport?: ApiTransport;
  /** 当前厂商 reasoning 偏好的顶层镜像。 */
  reasoning?: ReasoningPreference;
  // 按厂商缓存：切回该厂商时，从这里恢复 baseUrl / model / apiKey
  perProvider?: Record<string, ProviderProfile>;
  runtimeSync: "off" | "local" | "llm";
  stickerEnabled: boolean;
  stickerSize: "small" | "standard" | "large";
  stickerSimilarityThreshold: number;
  /** 整个聊天请求的超时（秒）。30-1800，默认 300。 */
  chatRequestTimeoutSec: number;
  /** CITA 结构化输出重试总预算（秒）。4-30，默认 8。 */
  citaRepairBudgetSec: number;
  vision?: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  /** Embedding 维度（可选，仅 cloud 模式）。留空 = 自动探测。 */
  embeddingDimensions?: number;
  multimodal: boolean;
  thinkingOverride?: -1 | 0 | 1;
  /** 禁用 max_tokens 注入。仅对自定义端点生效（与主进程 model-settings.ts 对齐）。 */
  disableMaxToken?: boolean;
  /** 上下文窗口大小（Token）。默认 256000。 */
  contextWindowTokens?: number;
}

export interface ModelPreset {
  providerName: string;
  // 与厂商注册表的静态关联键：真实厂商 = BuiltinProviderId，伪条目 = custom 两 id。
  // 存储查找暂仍走 providerName（displayName 过渡态），本字段只做静态对齐与一致性校验。
  providerId: ModelPresetProviderId;
  // 厂商短名（去括号后缀），用于状态栏"正在喂养"显示和昵称默认值。
  // 如 "MiniMax（稀宇科技）" → shortName "MiniMax"。
  shortName: string;
  baseUrl: string;
  /** 已由厂商官方确认的 Anthropic 兼容 Base URL；没有就不猜。 */
  anthropicBaseUrl?: string;
  /** 预设首次使用时选中的明确协议；用户之后可以手动修改。 */
  transport: ApiTransport;
  mainModels: string[];
  iconUrl: string;
  // 厂商官网链接，显示在预设下拉框旁边，方便用户直接跳转注册/查看文档。
  websiteUrl?: string;
  // 视觉模型的 OpenAI 兼容 baseUrl。主模型与视觉模型入口不同时使用。
  visionBaseUrl?: string;
  // 标记为 true 时，该项在 <select> 里显示但不可选；
  // 用于"已列出但 vendor adapter 还没接好"的情况，避免用户选到后调用直接报错。
  disabled?: boolean;
  // 独立视觉模型的默认值（applyPreset 在没有保存值时使用）。
  defaultVisionModel?: string;
  // 独立视觉模型的候选列表（用于视觉模型输入框的 datalist）。
  visionModels?: string[];
  // 自定义端点的云端/本地变体共用一张可见卡片，但分别持久化配置。
  customEndpointMode?: CustomEndpointMode;
  hiddenInPresetList?: boolean;
}

export interface GeneralSettings {
  maxParallelToolCalls: number;
  citaEnabled: boolean;
  citaSemanticEngine: "remote" | "local";
  chatSocialContextEnabled: boolean;
  momentsEnabled: boolean;
  chatMomentsContextEnabled: boolean;
  cyreneMomentsPostingEnabled: boolean;
  cyreneMomentsReactionsEnabled: boolean;
  momentsCharacterReactionsEnabled: boolean;
  /** 朋友圈热闹程度：抽签人数分布与角色日调用上限联动档位 */
  momentsLiveliness: "quiet" | "natural" | "lively";
  petAlwaysOnTop: boolean;
  rememberWindowState: boolean;
  petVisible: boolean;
  petZoom: number;
  disableGpuElectron?: boolean;
  /** 提醒中心音效总开关：关闭后所有 toast 静音 */
  toastSoundEnabled: boolean;
  launchAtLogin: boolean;
  language: "zh-CN";
  uiTheme: UiTheme;
  windowCornerRadius: number;
  uiThemeRadius: boolean;
  uiFont: UiFont;
  uiIcon: UiIcon;
  defaultChatMode: DefaultChatMode;
  currentStyleId?: string;
  customStyle: CustomStyleConfig;
  segmentedOutputMode: SegmentedOutputMode;
  mobileMessageSegmentation: MobileMessageSegmentationMode;
  proactiveChatMode: ProactiveChatMode;
  proactiveDeliveryTarget: ProactiveDeliveryTarget;
  /** 群聊近期上下文注入条数：3~50，默认 10（与主进程 normalizeGroupContextLimit 对齐）。 */
  groupContextLimit: number;
  /** 聊天段落间距（em）。目前仅设置窗口 UI 使用，主进程归一化尚未持久化该字段。 */
  chatParaSpacing?: number;
  screenshotHotkey?: string;
}

export interface UserApi {
  getProfile: () => Promise<{ nickname: string; callPreference: string; birthday: string; timezone: string; avatarPath: string; defaultCity: string; gender: string }>;
  saveProfile: (profile: Record<string, unknown>) => Promise<unknown>;
  uploadAvatar: () => Promise<{ avatarPath: string } | null>;
  getAvatar: () => Promise<string | null>;
  onAvatarChanged: (callback: () => void) => () => void;
}

export interface MemoryPanelPayload {
  l0: {
    preferredName: string;
    occupation: string;
    longTermInterests: string;
    language: string;
    permanentNote: string;
  };
  l1: {
    recentGoals: string;
    recentPreferences: string;
    currentProject: string;
  };
  l2: Array<{
    id: string;
    content: string;
    triggerText: string;
    status: "active" | "aging" | "archived";
    weight: number;
    createdAt: number;
  }>;
  importedDocs: Array<{
    importId: string | null;
    fileName: string;
    chunkCount: number;
    lastImportedAt: number;
  }>;
  reflections: Array<{
    id: string;
    title: string;
    body: string;
    meta: string;
  }>;
}

export interface ObsidianVaultConfig {
  vaultPath: string;
  autoSync: boolean;
  lastSyncAt: number;
}

export interface MemoryPanelApi {
  getData: () => Promise<MemoryPanelPayload>;
  deleteImportedDoc: (importId: string, fileName?: string) => Promise<{ ok: boolean; deleted: number }>;
  saveL0: (patch: Record<string, unknown>) => Promise<{ ok: boolean }>;
  saveL1: (patch: Record<string, unknown>) => Promise<{ ok: boolean }>;
  exportToObsidianVault: () => Promise<{
    ok: boolean;
    outputPath?: string;
    fileCount?: number;
    error?: string;
    canceled?: boolean;
  }>;
  bindVault: () => Promise<{
    ok: boolean;
    vaultPath?: string;
    fileCount?: number;
    error?: string;
    canceled?: boolean;
  }>;
  unbindVault: () => Promise<{ ok: boolean }>;
  getVaultConfig: () => Promise<ObsidianVaultConfig>;
  setAutoSync: (autoSync: boolean) => Promise<{ ok: boolean; config: ObsidianVaultConfig }>;
  syncNow: () => Promise<{ ok: boolean; vaultPath?: string; fileCount?: number; error?: string; skipped?: boolean }>;
  /** 删除全部长期记忆；restartRequired 表示必须重启才能让进程内缓存失效。 */
  deleteAll: () => Promise<DeleteAllMemoryResult>;
  /** 受控重启（删除记忆后调用）。 */
  restartApp: () => Promise<{ ok: boolean }>;
  // ── 记忆区块（zones）──
  getZoneSnapshot: () => Promise<ZonesSnapshot>;
  createZone: (name: string) => Promise<Zone>;
  renameZone: (zoneId: string, name: string) => Promise<Zone | null>;
  deleteZone: (zoneId: string) => Promise<boolean>;
  updateZoneConfig: (zoneId: string, patch: Partial<ZoneConfig>) => Promise<Zone | null>;
  addZoneMember: (zoneId: string, member: ZoneMember) => Promise<ZoneMutationResult>;
  /** 手动按群号 / 群 openid 加入区块（= 加入该渠道的群白名单）。 */
  addZoneManualGroup: (zoneId: string, channel: string, chatId: string, senderName?: string) => Promise<AddManualGroupResult>;
  removeZoneMember: (zoneId: string, member: ZoneMember) => Promise<ZoneMutationResult>;
  moveZoneMembers: (targetZoneId: string, members: ZoneMember[]) => Promise<ZoneMoveResult>;
  // ── 记忆管理控制台（P3） ──
  listMemoryManager: (view: MemoryManagerView) => Promise<{ items: MemoryManagerItem[] }>;
  queryMemoryManager: (view: MemoryManagerView, key: string) => Promise<MemoryManagerQueryResult>;
  deleteMemoryManager: (payload: { ids?: string[]; view?: MemoryManagerView; key?: string }) => Promise<MemoryManagerDeleteResult>;
  erasePreview: (personKey: string) => Promise<PersonErasePlan>;
  erasePerson: (personKey: string, previewId: string) => Promise<PersonEraseReport>;
  traceMemorySource: (memoryId: string) => Promise<MemoryTraceSourceResult>;
}

// ── 记忆区块（zones）数据形状 ──
// 与主进程 src/main/zones/types.ts 保持一致。渲染进程走 vite 打包，
// 不能直接 import 主进程模块，所以在渲染侧镜像一份类型声明。

/** 区块成员：desktop 只属于 root；external 是外部渠道会话。 */
export type ZoneMemberKind = "desktop" | "external";

export interface ZoneDesktopMember {
  kind: "desktop";
  conversationId: string;
}

export interface ZoneExternalMember {
  kind: "external";
  /** 渠道会话 ID（channel:<channel>:<hash16>），与 channels/history/*.jsonl 文件键一致。 */
  sessionId: string;
  /** 渠道 id（qq / wechat / feishu / qqbot / 插件动态渠道）。 */
  channel: string;
  /** 平台会话 id（群号 / 私聊对端 id）。 */
  chatId: string;
  chatType: "private" | "group";
  senderName?: string;
}

export type ZoneMember = ZoneDesktopMember | ZoneExternalMember;

export interface ZoneConfig {
  /** 群消息旁听：区块内未 @ 昔涟的消息也写入 transcript。 */
  observeGroupMessages: boolean;
  /** 是否在本区块注入 owner 的 L0/L1 画像（root 恒为开）。 */
  injectOwnerProfile: boolean;
}

export interface Zone {
  /** "root" 或 "zone_<timestamp>_<rand6>"。 */
  zoneId: string;
  /** 展示名。root 固定为 "desktop"。 */
  zoneName: string;
  isRoot: boolean;
  createdAt: number;
  members: ZoneMember[];
  config: ZoneConfig;
}

/** 见过的外部聊天（来自 channels/context-bindings.json 的 externalChats）。 */
export interface ZoneExternalChat {
  sessionId: string;
  channel: string;
  chatId: string;
  chatType: "private" | "group";
  senderName?: string;
  lastAt: number;
}

export interface ZoneConversation {
  id: string;
  title: string;
  mode: string;
  updatedAt: number;
}

export interface ZonesSnapshot {
  /** 第一个一定是 root。 */
  zones: Zone[];
  externalChats: ZoneExternalChat[];
  conversations: ZoneConversation[];
}

export type ZoneMutationResult = { ok: true; zone: Zone } | { ok: false; error: string };

/**
 * 手动加群结果。`movedFrom` 非空说明该群原本在别的区块里（加成员会自动移出旧区块），
 * UI 要把这件事说出来，避免用户以为"两个区块同时拥有它"。
 */
export type AddManualGroupResult =
  | { ok: true; zone: Zone; sessionId: string; movedFrom: { zoneId: string; zoneName: string } | null }
  | { ok: false; error: string };

export interface ZoneMoveResult {
  moved: number;
  errors: string[];
}

export interface DeleteAllMemoryResult {
  ok: boolean;
  deleted: string[];
  failed: Array<{ path: string; error: string }>;
  restartRequired: boolean;
}

/**
 * renderer 侧的 MCP server 配置视图。
 * 与主进程 McpServerConfig 对应（effectKindOverrides 等高级字段对 UI 不可见）。
 */
export interface McpServerConfigView {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface SettingsApi {
  minimize: () => void;
  close: () => void;
  getConfig: () => Promise<ModelSettings>;
  saveConfig: (config: Partial<ModelSettings>) => Promise<ModelSettings>;
  listModelProfiles?: () => Promise<{ profiles: Array<{ id: string; provider: string; displayName?: string; baseUrl: string; model: string; apiKey: string; explicitTransport?: ApiTransport; reasoning?: ReasoningPreference; contextWindowTokens?: number; multimodal?: boolean;
    modelOptions?: Record<string, { contextWindowTokens?: number; multimodal?: boolean }>; models?: string[] }>; defaultModelProfileId?: string }>;
  saveModelProfile?: (profile: { id?: string; provider: string; displayName?: string; baseUrl: string; model: string; apiKey: string; explicitTransport?: ApiTransport; reasoning?: ReasoningPreference; contextWindowTokens?: number; multimodal?: boolean;
    modelOptions?: Record<string, { contextWindowTokens?: number; multimodal?: boolean }>; models?: string[] }) => Promise<{ added: boolean; profiles: unknown[]; defaultModelProfileId?: string }>;
  deleteModelProfile?: (id: string) => Promise<unknown>;
  setDefaultModelProfile?: (id: string) => Promise<unknown>;
  getGeneral: () => Promise<GeneralSettings>;
  saveGeneral: (config: Partial<GeneralSettings>) => Promise<GeneralSettings>;
  openCustomStylePrompt?: () => Promise<{ ok: boolean; filePath?: string; error?: string }>;
  getTimeoutSettings: () => Promise<TimeoutSettings>;
  saveTimeoutSettings: (config: Partial<TimeoutSettings>) => Promise<TimeoutSettings>;
  pickUiFont: () => Promise<string | null>;
  importUiFont: (sourcePath: string) => Promise<UiFont>;
  resetUiFont: () => Promise<UiFont>;
  openSidebar: () => void;
  closeSidebar: () => void;
  openTasks: () => void;
  closeTasks: () => void;
  openChromeGpu: () => void;
  setPetAlwaysOnTop: (value: boolean) => void;
  setPetVisible: (value: boolean) => void;
  setPetZoom: (value: number) => void;
  previewRuntimeSync: (value: "off" | "local" | "llm") => void;
  openStickerManager: () => Promise<{ ok: boolean; error?: string }>;
  stickerPickFile?: () => Promise<string | null>;
  stickerAdd?: (payload: { sourcePath: string; id: string; description: string; phrases: string[] }) => Promise<unknown>;
  embeddingSetModel?: (model: string) => Promise<{ ok: boolean; clearedEntries?: number; error?: string }>;
  rerankerSetMode?: (mode: string) => Promise<boolean>;
  setToolEnabled?: (id: string, enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  getToolEnabled?: () => Promise<Record<string, boolean>>;
  // 三模适配层：工具-模式覆盖层（UI 设置面板用）
  getToolCatalog?: () => Promise<Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    modes: Array<"chat" | "work" | "code" | "learn"> | null;
    deprecated: string | null;
  }>>;
  getToolModeOverrides?: () => Promise<Record<string, Partial<Record<"chat" | "work" | "code" | "learn", boolean>>>>;
  setToolModeOverride?: (toolId: string, mode: "chat" | "work" | "code" | "learn", enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  clearToolModeOverride?: (toolId: string, mode?: "chat" | "work" | "code" | "learn") => Promise<{ ok: boolean; error?: string }>;
  // 三模适配层：Skill-模式覆盖层（聊天窗口用）。
  getSkillCatalog?: () => Promise<Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    source: string;
    modes: ("work" | "code" | "learn")[] | null;
    version?: string;
    references: string[];
  }>>;
  rescanSkills?: () => Promise<{ ok: boolean; count: number; error?: string }>;
  getSkillModeOverrides?: () => Promise<Record<string, Partial<Record<"work" | "code" | "learn", boolean>>>>;
  setSkillModeOverride?: (skillId: string, mode: "work" | "code" | "learn", enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  clearSkillModeOverride?: (skillId: string, mode?: "work" | "code" | "learn") => Promise<{ ok: boolean; error?: string }>;
  addMcpServer?: (config: McpServerConfigView) => Promise<{ ok: boolean; toolIds?: string[]; error?: string }>;
  removeMcpServer?: (serverId: string) => Promise<{ ok: boolean; error?: string }>;
  listMcpServers?: () => Promise<Array<{ id: string; name: string; connected: boolean; toolCount: number; toolIds: string[] }>>;
  listMcpServerConfigs?: () => Promise<McpServerConfigView[]>;
  getPermissionLevel?: () => Promise<{ level: "read-only" | "scoped" | "per-action" | "full" }>;
  setPermissionLevel?: (level: string) => Promise<{ ok: boolean; level?: string; error?: string }>;
  // 计划模式开关（renderer → main）：显式设置 on/off
  setPlanMode?: (payload: { conversationId: string; target: "on" | "off"; workspaceRoot?: string }) => Promise<{ ok: boolean; state?: string; reason?: string }>;
  // 计划模式状态查询（renderer → main）：挂载时调一次拿初始状态
  getPlanState?: (conversationId: string) => Promise<{ state: string }>;
  // 计划模式状态广播（main → renderer）：任意入口触发的状态切换都走这条
  onPlanStateChanged?: (
    callback: (payload: { conversationId: string; state: string }) => void,
  ) => (() => void) | void;
  testConnection?: (config: { provider: string; baseUrl: string; model: string; apiKey: string; explicitTransport?: ApiTransport; reasoning?: ReasoningPreference; manualReasoning?: import("../../../shared/manual-reasoning").ManualReasoningConfig }) => Promise<{ ok: boolean; latency: number; sample?: string; error?: string }>;
  previewReasoning?: (config: { provider: string; baseUrl: string; model: string; apiKey: string; explicitTransport?: ApiTransport; reasoning?: ReasoningPreference; manualReasoning?: import("../../../shared/manual-reasoning").ManualReasoningConfig }) => Promise<Record<string, unknown>>;
  testVision?: (config: { baseUrl: string; apiKey: string; model: string }) => Promise<{ ok: boolean; latency: number; sample?: string; error?: string }>;
  // main → settings：要求切到指定标签（窗口已打开时由 main 发这个事件）
  onSwitchSection?: (callback: (section: string) => void) => (() => void) | void;
  channelsGetConfig: () => Promise<any>;
  channelsSaveConfig: (patch: unknown) => Promise<any>;
  /** 拦截关键词 / 触发关键词：从 txt 文件导入（每行一个） */
  channelsKeywordsImportTxt?: () => Promise<
    { ok: true; keywords: string[]; fileName?: string } | { ok: false; canceled?: boolean; error?: string }
  >;
  channelsRestart: () => Promise<{ ok: boolean }>;
  channelsQqTestConnection: () => Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }>;
  /**
   * QQ 监听鉴权预检（renderer → main）：主进程按参数解析真实监听地址并判定是否
   * 必须配置 Access Token。渲染端看不到网络接口，因此不得自行复制该判定。
   */
  channelsQqResolveAuthRequirement: (input: { listenMode: string; customHost?: string }) => Promise<QqListenAuthRequirement>;
  channelsQqBotTestConnection: () => Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }>;
  channelsLogGet: (limit?: number) => Promise<unknown[]>;
  channelsLogClear: () => Promise<{ ok: boolean }>;
  onChannelsInstallProgress: (callback: (progress: { channel: string; phase: string; pct: number }) => void) => (() => void) | void;
  onChannelsWechatQrcode: (callback: (dataUrl: string) => void) => (() => void) | void;
  onChannelsWechatLoginDone: (callback: (payload: { ok: boolean; botId?: string; error?: string }) => void) => (() => void) | void;
  channelsWechatLoginStart: () => Promise<{ ok: boolean; error?: string }>;
  channelsGetStatus: () => Promise<Record<string, { phase?: string; message?: string }>>;
  onChannelsStatusChanged: (callback: (status: unknown) => void) => (() => void) | void;
  beginScreenshotHotkeyCapture: () => Promise<boolean>;
  endScreenshotHotkeyCapture: () => Promise<boolean>;
}

// ── 记忆管理控制台（P3） ──
export type MemoryManagerView = "people" | "zones" | "sessions";

export interface MemoryManagerItem {
  key: string;            // personKey | scope | sourceConversationId | "__unattributed__"
  label: string;          // 昵称 / 域显示名 / 会话显示名
  sublabel?: string;      // QQ 号 / sessionId
  total: number;
  own: number;            // 🗣 他的记忆（会被「彻底擦除」删掉）
  mentioned: number;      // 👥 别人提到他（默认保留）
  sessions: number;
  erasable: boolean;      // 仅按人视图、且 key 是合法 personKey 时为 true
}

export interface MemoryManagerMemory {
  id: string; content: string; triggerText: string; createdAt: number;
  status: string; scope?: string; sourceConversationId: string;
  speakerIds?: string[]; subjectIds?: string[]; isSummary?: boolean;
  subEntryCount?: number; sourceMessageIds?: string[];
}

export interface MemoryManagerSessionRef { sessionId: string; label: string; count: number }

export interface MemoryManagerQueryMeta {
  total: number; own: number; mentioned: number;
  personKey?: string; sessions: MemoryManagerSessionRef[];
}

export interface MemoryManagerQueryResult { memories: MemoryManagerMemory[]; meta: MemoryManagerQueryMeta }

export interface MemoryManagerDeleteResult {
  requested: number; removed: number; evidence: number; dmaeStates: number;
  conflictLogs: number; danglingRefsFixed: number; reflectionLogs: number; summariesRemoved: number;
  /** 真正从向量库删掉的条数（P3 §5.2 第 2 步：被删条目的 ragId 必须 0 命中）。 */
  vectors: number;
}

export interface PersonErasePlan {
  personKey: string; channel: string; senderId: string; knownNames: string[];
  sessions: Array<{ sessionId: string; kind: "private" | "group" | "unknown"; l2Count: number; hotLines: number; archiveLines: number; archiveMonths: number; assistantLines: number }>;
  l2: { total: number; byRule: { private: number; speaker: number }; ids: string[]; keptSubjectOnly: number; keptSamples: Array<{ content: string; speakerIds: string[] }> };
  summaries: { decompress: string[]; remove: string[] };
  vectors: number; evidence: number; dmaeStates: number; conflictLogs: number; reflectionLogs: number;
  /**
   * **对话的向量副本**将被删掉的条数（`chat_history_*`，D2）。
   * 与 `vectors`（记忆的向量副本）分开列：它们是两条不同的通道，混在一起就看不出来了。
   */
  chatHistoryVectors: number;
  entities: Array<{ name: string; scope?: string; relations: number }>;
  relationshipEntries: { byPersonKey: number; byScope: number; byTextFingerprint: number; unmatched: number; summaries: number };
  audit: { entries: number; files: number };
  channelLogLines: number;
  externalChats: number;
  /** **agent 运行记录**会被删掉的 run 数（D4：按会话过滤，`cyrene-runs/sessions/`）。 */
  runs: number;
  memoryBackups: { files: number; bytes: number };
  apiLog: { exists: boolean; bytes: number };
  residues: Array<{ kind: string; file: string; snippet: string }>;
  /** **有意不擦**的载体（`MEMORY_PRESERVED` 原样列表）—— 供弹窗如实列出会保留什么（O2）。 */
  preservedPaths: string[];
  warnings: string[];
  previewId: string;
}

export interface PersonEraseReport {
  personKey: string; partial: boolean; needsReconfirm: boolean; addedSincePreview: number;
  l2: { requested: number; removed: number; summariesRemoved: number; decompressed: number };
  transcript: { sessions: number; hotLines: number; archiveLines: number; assistantLines: number };
  /** 真正从向量库删掉的 `chat_history` 条数（D2）。 */
  chatHistoryVectors: number;
  audit: { entries: number; files: number };
  channelLog: { lines: number };
  externalChats: number;
  /** 真正删掉的 agent 运行记录数（D4）。 */
  runs: number;
  backups: { files: number; bytes: number };
  apiLog: { deleted: boolean; bytes: number };
  entities: { nodes: number; relations: number };
  relationship: { byPersonKey: number; byScope: number; byTextFingerprint: number; summaries: number };
  caches: { injections: number; sessionIndex: number; dmaeReloaded: boolean };
  obsidian: { synced: boolean };
  keptSubjectOnly: number;
  residues: Array<{ kind: string; file: string; snippet: string }>;
  failed: Array<{ step: string; target: string; error: string }>;
}

export interface MemoryTraceSourceResult {
  entries: Array<{ role: string; content: string; at: string; speakerName?: string; speakerId?: string; file: string }>;
  missing: boolean;
}
