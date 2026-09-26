/* 标记！AI写的超大技术债，延期重构*/
import "../ui/base.css";
import "./settings.css";
import "../ui/theme";
import neteaseLogoUrl from "./assets/netease-logo.svg?url";
import {
  normalizeChatSocialContextEnabled,
  normalizeDefaultChatMode,
  normalizeMobileMessageSegmentationMode,
  normalizeProactiveChatMode,
  normalizeProactiveDeliveryTarget,
  normalizeSegmentedOutputMode,
  type DefaultChatMode,
  type MobileMessageSegmentationMode,
  type ProactiveChatMode,
  type ProactiveDeliveryTarget,
  type SegmentedOutputMode,
} from "../../shared/preferences";
import { isProactiveDeliveryTargetSelectable } from "../../shared/proactive-delivery";
import type { UiTheme } from "../../shared/ui-theme";
import { DEFAULT_UI_FONT, normalizeUiFont, type UiFont } from "../../shared/ui-font";
import { normalizeUiIcon, type UiIcon } from "../../shared/ui-icon";
import {
  DEFAULT_WINDOW_CORNER_RADIUS,
  normalizeWindowCornerRadius,
} from "../../shared/window-corner-radius";
import { applyWindowCornerRadius } from "../ui/window-corner-radius";
import { getCitaUiState } from "./cita-settings-state";
import { type LoginFlowState } from "../../shared/music-types";
import type { ChatAppearanceSettings } from "../../shared/chat-appearance";
import { USAGE_BADGE_PRESETS, normalizeUsageBadgeColor, resolveUsageBadgeImage } from "../../shared/chat-appearance";
import {
  DEFAULT_CUSTOM_STYLE,
  normalizeCustomStyleConfig,
  type CustomStyleConfig,
  type DiversityPreference,
  type RepetitionLevel,
} from "../../shared/style-sampling";
import type {
  ScheduleConfig,
  SchedulerApi,
  SchedulerResult,
  SchedulerToolInfo,
  SchedulerToolMode,
  ScheduledTask,
  ScheduledTaskHistoryEntry,
} from "./scheduler/types";
import { musicState } from "./music/state";
import { musicHomeView, musicReturnBtn, musicSearchForm, musicSearchHint, musicQrStatus, musicLoginBtn, musicCancelBtn, musicDisconnectBtn, musicQrImg, musicQrTip, musicQrBox, musicFeedbackEl, musicAccountStatusText, musicSearchInput, musicSearchBtn, musicSearchResults, musicToggle, musicAccordionCard, musicAccordionBody } from "./music/dom";
import { channelsState } from "./channels/state";
import { mountPluginPanels } from "./plugin-panels";
import { channelsWechatEnabledEl, channelsFeishuEnabledEl, channelsWechatStatusEl, channelsFeishuStatusEl, channelsRateUserEl, channelsRateChannelEl, channelsTtsEl, channelsStickerEl, channelsToolSandboxOffEl, channelsToolSandboxAllEl, channelsFeishuAppIdEl, channelsFeishuAppSecretEl, channelsFeishuAppSecretRevealBtn, channelsFeishuSaveBtn, channelsWechatLoginBtn, channelsWechatRestartBtn, channelsWechatFeedbackEl, channelsFeishuFeedbackEl, channelsLogListEl, channelsLogRefreshBtn, channelsLogClearBtn } from "./channels/dom";
import { memoryState } from "./memory/state";
import { memoryL0NameInput, memoryL0OccupationInput, memoryL0InterestsInput, memoryL0LanguageInput, memoryL0NoteInput, memoryL1GoalsInput, memoryL1PreferencesInput, memoryL1ProjectInput, memoryL2SearchInput, memoryL2List, memoryImportedList, memoryReflectionList, memoryL0EditBtn, memoryL0CancelBtn, memoryL1EditBtn, memoryL1CancelBtn , embeddingDimensionsInput } from "./memory/dom";
import { schedulerState } from "./scheduler/state";
import { schedulerNewBtn, schedulerEmpty, schedulerList, schedulerEditor, schedulerEditorTitle, schedulerEditorClose, schedulerTitleInput, schedulerPromptInput, schedulerEnabledInput, schedulerKindInput, schedulerOnceRunAtInput, schedulerTimeOfDayInput, schedulerDayOfWeekInput, schedulerIntervalEveryInput, schedulerIntervalUnitInput, schedulerToolLimitInput, schedulerToolPicker, schedulerToolEmptyHint, schedulerSaveStatus, schedulerCancelBtn, schedulerSaveBtn } from "./scheduler/dom";

import { modalState } from "./shared/modal-state";
import { formatDateTime, escapeHtml } from "./shared/format";
import { parsePositiveIntOrThrow, parseCommandLine } from "./shared/parse";
import { appearanceForm, appearanceSaveStatus, runtimeSyncSelect, runtimeSyncNote, windowCornerRadiusInput, windowCornerRadiusVal, petAlwaysOnTopInput, petVisibleInput, petZoomInput, petZoomVal, chatLineHeightInput, chatLineHeightVal, assistantBubbleEnabledInput, chatParaSpacingInput, chatParaSpacingVal, launchAtLoginInput, uiFontCurrent, uiFontImportButton, uiFontResetButton, uiIconSelect, screenshotHotkeyInput, openChromeGpu, disableGpuInput, sidebarVisibleInput, tasksVisibleInput, toastSoundEnabledInput, usageBadgeColorSelect, usageBadgeColorCustom } from "./appearance/dom";
import { generalForm, generalSaveStatus, languageSelect, defaultChatModeSelect, segmentedOutputSelect, mobileMessageSegmentationSelect, proactiveChatSelect, proactiveDeliveryRow, proactiveDeliverySelect, chatSocialContextEnabledInput, momentsEnabledInput, cyreneMomentsPostingEnabledInput, cyreneMomentsReactionsEnabledInput, momentsCharacterReactionsEnabledInput, momentsLivelinessSelect, momentsPostingRow, momentsReactionsRow, momentsCharacterRow, momentsLivelinessRow, citaEnabledInput, citaEngineSelect, customStyleSamplingBtn, customStylePromptBtn } from "./general/dom";
import { minBtn, closeBtn, preferencesForm, sectionTitle, sectionHint, placeholderPanel, disclaimerPanel, pluginsPanel, apiRuntimeForm, placeholderIcon, placeholderTitle, placeholderCopy, saveStatus, runtimeSaveStatus, preferencesSaveStatus, openStickerManagerBtn, addStickerBtn } from "./shared/shell";
import { pluginAddBtn, neteaseDetailView, permissionBlocksWrap, permissionNote } from "./plugins/dom";
import { preferencesState } from "./preferences/state";
import { stickerEnabledInput, stickerSizeSelect, stickerThresholdInput, stickerThresholdVal, stickerAddOverlay, stickerAddPickBtn, stickerAddFileName, stickerAddId, stickerAddDesc, stickerAddPhrases, stickerAddError, stickerAddConfirm, stickerAddCancel } from "./preferences/dom";
import { diversityDriverOf, diversityValueOf } from "./preferences/style-utils";
import { pluginsState } from "./plugins/state";
import type {
  GeneralSettings,
  MemoryPanelApi,
  MemoryPanelPayload,
  ModelSettings,
  SettingsApi,
  UserApi,
} from "./shared/types";
import { showModal, showHtmlModal, showInputModal } from "./shared/modal";
import {
  setSaveStatus, setPreferencesSaveStatus, setAppearanceSaveStatus,
  setGeneralSaveStatus, setRuntimeSaveStatus,
} from "./shared/save-status";
import { renderEmptyState, renderInfoList } from "./shared/render";
import { shallowEqual, safeGet } from "./shared/utils";
import {
  loadMemoryPanel,
  enterL0EditMode, exitL0EditMode, saveL0, cancelL0Edit,
  enterL1EditMode, exitL1EditMode, saveL1, cancelL1Edit,
  renderImportedDocs, initGroupContextLimitInput,
} from "./memory/panel";
import { initDeleteAllMemoryUI } from "./memory/delete-all";
import { initObsidianVaultUI } from "./memory/obsidian-vault-ui";
import { disposeMemoryManager, loadMemoryManager } from "./memory/manager";
import { initMemoryManagerUI } from "./memory/erasure-flow";
import { loadZonesPanel, disposeZonesPanel } from "./zones/panel";
import { registerSectionSwitcher } from "./shared/section-nav";
import {
  setSchedulerStatus, renderSchedulerTools, renderSchedulerList,
  loadSchedulerPanel, openSchedulerEditor, closeSchedulerEditor,
  updateSchedulerConditionalFields, collectSchedule, collectAllowedToolIds,
  saveSchedulerTask, toggleSchedulerTask, fireSchedulerTask,
  deleteSchedulerTask, toggleSchedulerHistory,
} from "./scheduler/panel";
import { loadMusicPanel, disposeMusicPanel } from "./music/panel";
import { initLocalMusicPanel } from "./music/local-panel";
import { loadChannelsPanel } from "./channels/panel";
import { renderProactiveDeliveryAvailability } from "./channels/panel";
import "./asr/panel";  // 副作用导入：执行事件绑定 + 初始加载
import "./email/panel";  // 副作用导入：执行事件绑定 + 初始加载
import "./search/panel";  // 副作用导入：执行事件绑定 + 初始加载
import { saveTimeoutSettings } from "./timeout/panel";  // saveTimeoutSettings 被 API 表单处理器调用
import { DEFAULT_TIMEOUT_SETTINGS, type TimeoutSettings } from "../../shared/timeout-types";  // mock + API 表单校验用
import "./user/panel";  // 副作用导入：执行事件绑定 + 初始加载
import "./plugins/panel";  // 副作用导入：执行事件绑定 + 初始加载
import "./plugins/permission";  // 副作用导入：权限档位 UI + 风险确认弹窗
import "./tts/panel";  // 副作用导入：TTS 配置加载 + 引擎切换 + 测试发音 + 音色复刻
import "./rag/panel";  // 副作用导入：RAG 模型切换 + Embedding 下载/删除 + Reranker 模式
import "./preferences/panel";  // 副作用导入：截图热键捕获 + 表情包列表/添加/删除
import "./mcp/panel";  // 副作用导入：MCP Server 添加/删除/启停 + 自定义端点接入说明

import { t } from "./i18n";

// Inline modal (to avoid Vite tree-shaking)

/**
 * 富文本模态框（基于 cy-modal 样式但使用独立 overlay，避免与 showModal 冲突）。
 * 用于"音色快速复刻"这种需要展示多组说明（规格 / 费用 / 过期规则）的场景。
 * 调用方负责传入安全的 HTML（项目内固定字符串）；若内容来自用户/网络必须先 escapeHtml。
 */

// escapeHtml() 已定义在文件下方（settings.ts:3738），此处复用即可。

// Inline input modal (Electron 禁用了 window.prompt，所以自己实现)

declare global {
  interface Window {
    settings?: SettingsApi;
    cyreneScheduler?: SchedulerApi;
    user?: UserApi;
    memoryPanel?: MemoryPanelApi;
  }
}

// MiMo 的 icon 是 lobehub-icons 仓库的 PNG（不在 icons-static-svg 包里）。
// 单独声明，与 8 家 npmmirror SVG 常量解耦（feat/chore 两个 commit 真正独立）。
// 实施时若图片加载失败，可考虑：1) 锁定 commit hash；2) 下载到本地 assets/icons/mimo.png
const MIMO_ICON_URL =
  "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/xiaomimimo.png";

if (!window.settings) {
  (window as unknown as { settings: SettingsApi }).settings = {
    minimize: () => {},
    close: () => {},
    getConfig: () =>
      Promise.resolve({
        mode: "auto",
        provider: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        apiKey: "",
        runtimeSync: "off",
        stickerEnabled: true,
        stickerSize: "standard",
        stickerSimilarityThreshold: 0.55,
        chatRequestTimeoutSec: 300,
        citaRepairBudgetSec: 8,
        multimodal: true,
      }),
    saveConfig: (c) => Promise.resolve(c as ModelSettings),
    getGeneral: () => Promise.resolve({
      maxParallelToolCalls: 4,
      citaEnabled: false,
      citaSemanticEngine: "remote",
      petAlwaysOnTop: true,
      petVisible: true,
      petZoom: 1,
      chatLineHeight: 1.75,
      assistantBubbleEnabled: false,
      usageBadgeColor: "preset:peach-sunset",
      chatParaSpacing: 0.5,
      sidebarVisible: true,
      tasksVisible: true,
      toastSoundEnabled: true,
      launchAtLogin: false,
      language: "zh-CN",
      uiTheme: "pearl-white",
      uiThemeRadius: false,
      uiFont: DEFAULT_UI_FONT,
      uiIcon: "cyrene-sun",
      windowCornerRadius: DEFAULT_WINDOW_CORNER_RADIUS,
      defaultChatMode: "chat",
      currentStyleId: "default",
      customStyle: DEFAULT_CUSTOM_STYLE,
      segmentedOutputMode: "off",
      mobileMessageSegmentation: "off",
      proactiveChatMode: "off",
      proactiveDeliveryTarget: "local",
      groupContextLimit: 10,
      chatSocialContextEnabled: false,
      momentsEnabled: true,
      chatMomentsContextEnabled: true,
      cyreneMomentsPostingEnabled: false,
      cyreneMomentsReactionsEnabled: true,
      momentsCharacterReactionsEnabled: true,
      momentsLiveliness: "quiet",
      screenshotHotkey: "Alt+Shift+S",
    }),
    saveGeneral: (c) => Promise.resolve(c as GeneralSettings),
    openCustomStylePrompt: async () => ({ ok: false, error: "settings api unavailable" }),
    channelsGetConfig: () => Promise.resolve({ wechat: {}, feishu: {}, qq: {} }),
    channelsSaveConfig: () => Promise.resolve({}),
    channelsRestart: () => Promise.resolve({ ok: false }),
    channelsQqTestConnection: () => Promise.resolve({ ok: false, error: "settings api unavailable" }),
    channelsQqBotTestConnection: () => Promise.resolve({ ok: false, error: "settings api unavailable" }),
    channelsLogGet: () => Promise.resolve([]),
    channelsLogClear: () => Promise.resolve({ ok: true }),
    onChannelsInstallProgress: () => () => {},
    onChannelsWechatQrcode: () => () => {},
    onChannelsWechatLoginDone: () => () => {},
    channelsWechatLoginStart: () => Promise.resolve({ ok: false, error: "settings api unavailable" }),
    channelsGetStatus: () => Promise.resolve({}),
    onChannelsStatusChanged: () => () => {},
    beginScreenshotHotkeyCapture: () => Promise.resolve(true),
    endScreenshotHotkeyCapture: () => Promise.resolve(true),
    openSidebar: () => {},
    closeSidebar: () => {},
    openTasks: () => {},
    closeTasks: () => {},
    openChromeGpu: () => {},
    setPetAlwaysOnTop: () => {},
    setPetVisible: () => {},
    setPetZoom: () => {},
    pickUiFont: () => Promise.resolve(null),
    importUiFont: () => Promise.resolve(DEFAULT_UI_FONT),
    resetUiFont: () => Promise.resolve(DEFAULT_UI_FONT),
    previewRuntimeSync: () => {},
    openStickerManager: async () => ({ ok: false, error: "settings api unavailable" }),
    stickerPickFile: async () => null,
    stickerAdd: async () => { throw new Error("settings api unavailable"); },
    setToolEnabled: async () => ({ ok: false, error: "settings api unavailable" }),
    getToolEnabled: async () => ({}),
    getToolCatalog: async () => [],
    getToolModeOverrides: async () => ({}),
    setToolModeOverride: async () => ({ ok: false, error: "settings api unavailable" }),
    clearToolModeOverride: async () => ({ ok: false, error: "settings api unavailable" }),
    getSkillCatalog: async () => [],
    rescanSkills: async () => ({ ok: false, count: 0, error: "settings api unavailable" }),
    getSkillModeOverrides: async () => ({}),
    setSkillModeOverride: async () => ({ ok: false, error: "settings api unavailable" }),
    clearSkillModeOverride: async () => ({ ok: false, error: "settings api unavailable" }),
    addMcpServer: async () => ({ ok: false, error: "settings api unavailable" }),
    removeMcpServer: async () => ({ ok: false, error: "settings api unavailable" }),
    listMcpServers: async () => [],
    getTimeoutSettings: async () => DEFAULT_TIMEOUT_SETTINGS,
    saveTimeoutSettings: async c => (c as TimeoutSettings),
  };
}

if (!window.cyreneScheduler) {
  (window as unknown as { cyreneScheduler: SchedulerApi }).cyreneScheduler = {
    list: async () => ({ ok: true, value: [] }),
    add: async () => ({ ok: false, error: "scheduler api unavailable" }),
    update: async () => ({ ok: false, error: "scheduler api unavailable" }),
    delete: async () => ({ ok: false, error: "scheduler api unavailable" }),
    toggle: async () => ({ ok: false, error: "scheduler api unavailable" }),
    fireNow: async () => ({ ok: false, reason: "scheduler api unavailable" }),
    getHistory: async () => ({ ok: true, value: [] }),
    getTools: async () => ({ ok: true, value: [] }),
  };
}

document.querySelectorAll<HTMLImageElement>("[data-music-logo]").forEach((image) => {
  image.src = neteaseLogoUrl;
});

// 模式按钮已删除——baseUrl 永远可改、模型名永远可手填（datalist 出预设建议）
// provider 不再暴露给用户（从预设内部拿，保证 capabilities 匹配不出错）。
// 用户看到的是"昵称"框——给模型起自定义名字，状态栏"正在喂养"显示它。
// API 协议下拉（openai / anthropic）—— 不根据 URL 自动猜测。

// 注：API 设置（预设 / 档案 / 自定义端点 / 视觉模型）已迁到聊天窗口的「模型」面板，
// 由 React 侧实现；本窗口只保留「高级设置」里的运行参数。

const NAV_LABELS: Record<string, { emoji: string; title: string; hint: string }> = {
  memory: { emoji: `<img src="../icons/mimi.png" width="24" height="24" alt="" aria-hidden="true" style="vertical-align:-3px" />`, title: t("settings.nav.memory"), hint: t("settings.nav.memoryHint") },
  zones: { emoji: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="vertical-align:-3px"><rect x="6" y="8" width="15" height="15" rx="3" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="27" y="8" width="15" height="15" rx="3" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="6" y="29" width="15" height="15" rx="3" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="27" y="29" width="15" height="15" rx="3" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`, title: t("settings.nav.zones"), hint: t("settings.nav.zonesHint") },
  chat: { emoji: `<svg style="vertical-align:-3px" width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M33 38H22V30H36V22H44V38H39L36 41L33 38Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 6H36V30H17L13 34L9 30H4V6Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 18H20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M26 18H27" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 18H13" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`, title: t("settings.nav.chat"), hint: t("settings.nav.chatHint") },
  user: { emoji: `<svg style="vertical-align:-3px" width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M44 8H4V38H19L24 43L29 38H44V8Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="19" r="5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M33 32C33 27.5817 28.9706 24 24 24C19.0294 24 15 27.5817 15 32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`, title: t("settings.nav.user"), hint: t("settings.nav.userHint") },
  tasks: { emoji: `<svg style="vertical-align:-3px" width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M23.9998 44.3332C34.1251 44.3332 42.3332 36.1251 42.3332 25.9999C42.3332 15.8747 34.1251 7.66656 23.9998 7.66656C13.8746 7.66656 5.6665 15.8747 5.6665 25.9999C5.6665 36.1251 13.8746 44.3332 23.9998 44.3332Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M23.7594 15.3536L23.7582 26.3624L31.5305 34.1347" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9.00001L11 4.00001" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M44 9.00001L37 4.00001" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`, title: t("settings.nav.tasks"), hint: t("settings.nav.tasksHint") },
  plugins: { emoji: "🔌", title: t("settings.nav.plugins"), hint: t("settings.nav.pluginsHint") },
  preferences: { emoji: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="vertical-align:-3px"><title>偏好设置</title><path d="M12 35.0137H9H4V8.01273C4 6.90868 4.89543 6.01367 6 6.01367H42C43.1046 6.01367 44 6.90868 44 8.01273V35.0137H36" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 32L14 42H34L24 32Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`, title: "偏好设置", hint: "设置聊天窗口和输出行为的默认偏好" },
  appearance: { emoji: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="vertical-align:-3px"><title>外观设置</title><path d="M24 44C29.9601 44 26.3359 35.136 30 31C33.1264 27.4709 44 29.0856 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M28 17C29.6569 17 31 15.6569 31 14C31 12.3431 29.6569 11 28 11C26.3431 11 25 12.3431 25 14C25 15.6569 26.3431 17 28 17Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M16 21C17.6569 21 19 19.6569 19 18C19 16.3431 17.6569 15 16 15C14.3431 15 13 16.3431 13 18C13 19.6569 14.3431 21 16 21Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M17 34C18.6569 34 20 32.6569 20 31C20 29.3431 18.6569 28 17 28C15.3431 28 14 29.3431 14 31C14 32.6569 15.3431 34 17 34Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`, title: "外观设置", hint: "调整窗口布局、界面主题与昔涟桌宠" },
  general: { emoji: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="vertical-align:-3px"><title>通用设置</title><path d="M18.2838 43.1713C14.9327 42.1736 11.9498 40.3213 9.58787 37.867C10.469 36.8227 11 35.4734 11 34.0001C11 30.6864 8.31371 28.0001 5 28.0001C4.79955 28.0001 4.60139 28.01 4.40599 28.0292C4.13979 26.7277 4 25.3803 4 24.0001C4 21.9095 4.32077 19.8938 4.91579 17.9995C4.94381 17.9999 4.97188 18.0001 5 18.0001C8.31371 18.0001 11 15.3138 11 12.0001C11 11.0488 10.7786 10.1493 10.3846 9.35011C12.6975 7.1995 15.5205 5.59002 18.6521 4.72314C19.6444 6.66819 21.6667 8.00013 24 8.00013C26.3333 8.00013 28.3556 6.66819 29.3479 4.72314C32.4795 5.59002 35.3025 7.1995 37.6154 9.35011C37.2214 10.1493 37 11.0488 37 12.0001C37 15.3138 39.6863 18.0001 43 18.0001C43.0281 18.0001 43.0562 17.9999 43.0842 17.9995C43.6792 19.8938 44 21.9095 44 24.0001C44 25.3803 43.8602 26.7277 43.594 28.0292C43.3986 28.01 43.2005 28.0001 43 28.0001C39.6863 28.0001 37 30.6864 37 34.0001C37 35.4734 37.531 36.8227 38.4121 37.867C36.0502 40.3213 33.0673 42.1736 29.7162 43.1713C28.9428 40.752 26.676 39.0001 24 39.0001C21.324 39.0001 19.0572 40.752 18.2838 43.1713Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 31C27.866 31 31 27.866 31 24C31 20.134 27.866 17 24 17C20.134 17 17 20.134 17 24C17 27.866 20.134 31 24 31Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`, title: "通用设置", hint: "管理窗口、音频和系统行为" },
  "api-advanced": { emoji: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="vertical-align:-3px"><title>高级设置</title><path d="M34.0003 41L44 24L34.0003 7H14.0002L4 24L14.0002 41H34.0003Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`, title: "高级设置", hint: "配置 API 超时时间、调用模式．" },
  cyrene: { emoji: "🌸", title: t("settings.nav.cyrene"), hint: t("settings.nav.cyreneHint") },
  tts: { emoji: "🎙️", title: t("settings.nav.tts"), hint: t("settings.nav.ttsHint") },
  asr: { emoji: "🎧", title: t("settings.nav.asr"), hint: t("settings.nav.asrHint") },
	  tokens: { emoji: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="vertical-align:-3px"><title>Token 用量</title><path d="M4 42H44" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="28" width="6" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="21" y="18" width="6" height="24" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="34" y="6" width="6" height="36" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`, title: "Token 用量", hint: "查看 API 调用统计与消耗" },
	  disclaimer: { emoji: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="vertical-align:-3px"><title>免责声明</title><rect x="13" y="10" width="28" height="34" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M35 10V4H8C7.44772 4 7 4.44772 7 5V38H13" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 22H33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 30H33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`, title: "免责声明", hint: "使用条款与隐私说明" },
};

minBtn.addEventListener("click", () => window.settings?.minimize());
closeBtn.addEventListener("click", () => window.settings?.close());

async function saveAppearancePatch(patch: Partial<GeneralSettings>, successText = t("settings.status.applied")): Promise<void> {
  try {
    setAppearanceSaveStatus(t("settings.status.applying"));
    await window.settings!.saveGeneral(patch);
    setAppearanceSaveStatus(successText, "is-ok");
  } catch (error) {
    console.error("自动应用外观设置失败:", error);
    setAppearanceSaveStatus(t("settings.status.applyFailed"), "is-error");
  }
}

// ── 用量徽章文字颜色（外观设置-个性化） ──────────────────────
// 预设渐变来自共享常量（与聊天窗口同一份），自定义取色器写 #rrggbb；改动即时生效。

function renderUsageColorOptions(): void {
  if (!usageBadgeColorSelect) return;
  usageBadgeColorSelect.innerHTML = USAGE_BADGE_PRESETS.map((preset) => (
    `<button type="button" class="usage-color-option" data-usage-color="preset:${preset.id}" aria-pressed="false" title="${preset.label}">`
    + `<span style="background-image:${preset.image}"></span>`
    + "</button>"
  )).join("");
}

function applyUsageBadgeColorSelection(value: string): void {
  const normalized = normalizeUsageBadgeColor(value);
  usageBadgeColorSelect?.querySelectorAll<HTMLButtonElement>("button[data-usage-color]").forEach((button) => {
    const active = button.dataset.usageColor === normalized;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (usageBadgeColorCustom && !normalized.startsWith("preset:")) {
    // 自定义色时同步取色器，方便二次微调
    usageBadgeColorCustom.value = normalized;
  }
  // 设置页自身预览同一套变量
  document.documentElement.style.setProperty("--cy-usage-badge-image", resolveUsageBadgeImage(normalized));
}

renderUsageColorOptions();

usageBadgeColorSelect?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-usage-color]");
  if (!button) return;
  const value = button.dataset.usageColor ?? "";
  applyUsageBadgeColorSelection(value);
  void saveAppearancePatch({ usageBadgeColor: value });
});

usageBadgeColorCustom?.addEventListener("change", () => {
  const value = usageBadgeColorCustom.value;
  applyUsageBadgeColorSelection(value);
  void saveAppearancePatch({ usageBadgeColor: value });
});

function getRuntimeSyncValue(): "off" | "local" | "llm" {
  const v = runtimeSyncSelect.querySelector<HTMLButtonElement>(".option-block.is-active")?.dataset.value; return v === "llm" ? "llm" : v === "local" ? "local" : "off";
}

function applyRuntimeSyncSelection(value: "off" | "local" | "llm"): void {
  runtimeSyncSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  syncRuntimeNote();
}

function syncRuntimeNote(): void {
  runtimeSyncNote.classList.toggle("is-hidden", getRuntimeSyncValue() !== "llm");
}

function getStickerSizeValue(): "small" | "standard" | "large" {
  const value = stickerSizeSelect.querySelector<HTMLButtonElement>(".option-block.is-active")?.dataset.value;
  return value === "small" || value === "large" ? value : "standard";
}

function applyStickerSizeSelection(value: "small" | "standard" | "large"): void {
  stickerSizeSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyLanguageSelection(language: "zh-CN"): void {
  languageSelect.querySelectorAll<HTMLButtonElement>(".language-option").forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyOptionGroupValue(group: HTMLElement, value: string): void {
  group.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function getOptionGroupValue(group: HTMLElement, fallback: string): string {
  return group.querySelector<HTMLButtonElement>(".option-block.is-active")?.dataset.value ?? fallback;
}

function applyDefaultChatModeSelection(mode: DefaultChatMode): void {
  applyOptionGroupValue(defaultChatModeSelect, mode);
}

function getDefaultChatModeValue(): DefaultChatMode {
  return normalizeDefaultChatMode(getOptionGroupValue(defaultChatModeSelect, "chat"));
}

function applySegmentedOutputSelection(mode: SegmentedOutputMode): void {
  applyOptionGroupValue(segmentedOutputSelect, mode);
}

function getSegmentedOutputValue(): SegmentedOutputMode {
  return normalizeSegmentedOutputMode(getOptionGroupValue(segmentedOutputSelect, "off"));
}

function applyMobileMessageSegmentationSelection(mode: MobileMessageSegmentationMode): void {
  applyOptionGroupValue(mobileMessageSegmentationSelect, mode);
}

function getMobileMessageSegmentationValue(): MobileMessageSegmentationMode {
  return normalizeMobileMessageSegmentationMode(getOptionGroupValue(mobileMessageSegmentationSelect, "off"));
}

function applyProactiveChatSelection(mode: ProactiveChatMode): void {
  applyOptionGroupValue(proactiveChatSelect, mode);
}

function getProactiveChatValue(): ProactiveChatMode {
  return normalizeProactiveChatMode(getOptionGroupValue(proactiveChatSelect, "off"));
}

// 朋友圈热闹程度：非法值回落冷清档（与主进程归一化逻辑一致）
function applyMomentsLivelinessSelection(liveliness: string): void {
  applyOptionGroupValue(momentsLivelinessSelect, liveliness === "natural" || liveliness === "lively" ? liveliness : "quiet");
}

function getMomentsLivelinessValue(): "quiet" | "natural" | "lively" {
  const value = getOptionGroupValue(momentsLivelinessSelect, "quiet");
  return value === "natural" || value === "lively" ? value : "quiet";
}

function applyProactiveDeliverySelection(target: ProactiveDeliveryTarget): void {
  applyOptionGroupValue(proactiveDeliverySelect, target);
}

function getProactiveDeliveryValue(): ProactiveDeliveryTarget {
  return normalizeProactiveDeliveryTarget(getOptionGroupValue(proactiveDeliverySelect, "local"));
}

function buildCustomStyleConfigFromModal(): CustomStyleConfig {
  if (!preferencesState.customStyleOverlay) return preferencesState.currentCustomStyleConfig;
  const diversityDriver = (
    preferencesState.customStyleOverlay.querySelector<HTMLInputElement>('input[name="custom-diversity"]:checked')?.value
    ?? "model-default"
  ) as DiversityPreference["driver"];
  const rawValue = Number((
    preferencesState.customStyleOverlay.querySelector<HTMLInputElement>("#custom-diversity-value")?.value
    ?? ""
  ).trim());
  const repetition = (
    preferencesState.customStyleOverlay.querySelector<HTMLInputElement>('input[name="custom-repetition"]:checked')?.value
    ?? "model-default"
  ) as RepetitionLevel;
  return normalizeCustomStyleConfig({
    diversity: diversityDriver === "model-default"
      ? { driver: "model-default" }
      : { driver: diversityDriver, value: rawValue },
    repetition,
  });
}

function ensureCustomStyleModal(): HTMLElement {
  if (preferencesState.customStyleOverlay) return preferencesState.customStyleOverlay;
  preferencesState.customStyleOverlay = document.createElement("div");
  preferencesState.customStyleOverlay.id = "custom-style-overlay";
  preferencesState.customStyleOverlay.className = "cy-modal-overlay is-hidden custom-style-overlay";
  preferencesState.customStyleOverlay.innerHTML = [
    '<div class="cy-modal custom-style-modal" role="dialog" aria-modal="true">',
    '  <div class="cy-modal__head"><span class="cy-modal__icon">🖊️</span><h3 class="cy-modal__title">自定义风格采样</h3></div>',
    '  <hr class="cy-modal__divider">',
    '  <div class="custom-style-modal__section">',
    '    <div class="custom-style-modal__label">多样性控制</div>',
    '    <label><input type="radio" name="custom-diversity" value="model-default"> 跟随模型</label>',
    '    <label><input type="radio" name="custom-diversity" value="temperature"> Temperature</label>',
    '    <label><input type="radio" name="custom-diversity" value="top-p"> Top-P</label>',
    '    <div class="custom-style-modal__value" id="custom-diversity-row"><span id="custom-diversity-label">Temperature</span><input id="custom-diversity-value" type="number" min="0" max="2" step="0.01"></div>',
    '  </div>',
    '  <div class="custom-style-modal__section">',
    '    <div class="custom-style-modal__label">重复控制</div>',
    '    <label><input type="radio" name="custom-repetition" value="model-default"> 跟随模型</label>',
    '    <label><input type="radio" name="custom-repetition" value="light"> 轻度抑制</label>',
    '    <label><input type="radio" name="custom-repetition" value="medium"> 中度抑制</label>',
    '    <label><input type="radio" name="custom-repetition" value="strong"> 重度抑制</label>',
    '  </div>',
    '  <div class="cy-modal__actions">',
    '    <button type="button" class="ghost-btn" id="custom-style-reset">恢复默认</button>',
    '    <button type="button" class="ghost-btn" id="custom-style-cancel">取消</button>',
    '    <button type="button" class="btn-primary" id="custom-style-save">保存</button>',
    '  </div>',
    '</div>',
  ].join("\n");
  document.body.appendChild(preferencesState.customStyleOverlay);

  const updateDiversityRow = () => {
    const driver = preferencesState.customStyleOverlay!.querySelector<HTMLInputElement>(
      'input[name="custom-diversity"]:checked',
    )?.value ?? "model-default";
    const row = preferencesState.customStyleOverlay!.querySelector<HTMLElement>("#custom-diversity-row");
    const label = preferencesState.customStyleOverlay!.querySelector<HTMLElement>("#custom-diversity-label");
    const value = preferencesState.customStyleOverlay!.querySelector<HTMLInputElement>("#custom-diversity-value");
    if (!row || !label || !value) return;
    row.hidden = driver === "model-default";
    label.textContent = driver === "top-p" ? "Top-P" : "Temperature";
    value.min = "0";
    value.max = driver === "top-p" ? "1" : "2";
  };
  preferencesState.customStyleOverlay.querySelectorAll<HTMLInputElement>('input[name="custom-diversity"]').forEach((input) => {
    input.addEventListener("change", updateDiversityRow);
  });
  preferencesState.customStyleOverlay.querySelector<HTMLButtonElement>("#custom-style-cancel")?.addEventListener("click", () => {
    preferencesState.customStyleOverlay?.classList.add("is-hidden");
  });
  preferencesState.customStyleOverlay.querySelector<HTMLButtonElement>("#custom-style-reset")?.addEventListener("click", () => {
    renderCustomStyleModal(DEFAULT_CUSTOM_STYLE);
  });
  preferencesState.customStyleOverlay.querySelector<HTMLButtonElement>("#custom-style-save")?.addEventListener("click", async () => {
    try {
      preferencesState.currentCustomStyleConfig = buildCustomStyleConfigFromModal();
      await window.settings!.saveGeneral({ customStyle: preferencesState.currentCustomStyleConfig });
      preferencesState.customStyleOverlay?.classList.add("is-hidden");
      setPreferencesSaveStatus(t("settings.modal.customStyle.saved"), "is-ok");
    } catch {
      setPreferencesSaveStatus(t("settings.modal.customStyle.saveFailed"), "is-error");
    }
  });
  return preferencesState.customStyleOverlay;
}

function renderCustomStyleModal(config: CustomStyleConfig): void {
  const overlay = ensureCustomStyleModal();
  const normalized = normalizeCustomStyleConfig(config);
  const driver = diversityDriverOf(normalized);
  const repetition = normalized.repetition;
  const driverInput = overlay.querySelector<HTMLInputElement>(
    `input[name="custom-diversity"][value="${driver}"]`,
  );
  const repetitionInput = overlay.querySelector<HTMLInputElement>(
    `input[name="custom-repetition"][value="${repetition}"]`,
  );
  if (driverInput) driverInput.checked = true;
  if (repetitionInput) repetitionInput.checked = true;
  const valueInput = overlay.querySelector<HTMLInputElement>("#custom-diversity-value");
  if (valueInput) valueInput.value = String(diversityValueOf(normalized));
  overlay.querySelectorAll<HTMLInputElement>('input[name="custom-diversity"]').forEach((input) => {
    input.dispatchEvent(new Event("change"));
  });
}

function openCustomStyleModal(): void {
  const overlay = ensureCustomStyleModal();
  renderCustomStyleModal(preferencesState.currentCustomStyleConfig);
  overlay.classList.remove("is-hidden");
}

function renderProactiveDeliveryVisibility(): void {
  proactiveDeliveryRow.hidden = getProactiveChatValue() !== "on";
}

// 朋友圈动态总开关关闭时隐藏昔涟行为子开关（与主动消息投递行的显隐模式一致）
function renderMomentsSubRowsVisibility(): void {
  momentsPostingRow.hidden = !momentsEnabledInput.checked;
  momentsReactionsRow.hidden = !momentsEnabledInput.checked;
  momentsCharacterRow.hidden = !momentsEnabledInput.checked;
  momentsLivelinessRow.hidden = !momentsEnabledInput.checked;
}

function renderUiFont(font: UiFont): void {
  uiFontCurrent.textContent = font.kind === "custom" ? font.displayName : t("settings.appearance.font.defaultNotion");
  uiFontResetButton.hidden = font.kind !== "custom";
}

function renderUiIcon(icon: UiIcon): void {
  uiIconSelect.querySelectorAll<HTMLButtonElement>(".appearance-icon-option").forEach((button) => {
    const active = button.dataset.icon === icon;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

async function loadGeneralSettings(): Promise<void> {
  try {
    const cfg = await window.settings!.getGeneral();
    const cita = getCitaUiState({ enabled: cfg.citaEnabled, semanticEngine: cfg.citaSemanticEngine });
    citaEnabledInput.checked = cita.enabled;
    chatSocialContextEnabledInput.checked = normalizeChatSocialContextEnabled(cfg.chatSocialContextEnabled);
    momentsEnabledInput.checked = cfg.momentsEnabled ?? true;
    cyreneMomentsPostingEnabledInput.checked = cfg.cyreneMomentsPostingEnabled ?? false;
    cyreneMomentsReactionsEnabledInput.checked = cfg.cyreneMomentsReactionsEnabled ?? true;
    momentsCharacterReactionsEnabledInput.checked = cfg.momentsCharacterReactionsEnabled ?? true;
    applyMomentsLivelinessSelection(cfg.momentsLiveliness ?? "quiet");
    renderMomentsSubRowsVisibility();
    citaEngineSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
      const selected = button.dataset.value === cita.selectedEngine;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const windowCornerRadius = normalizeWindowCornerRadius(cfg.windowCornerRadius);
    windowCornerRadiusInput.value = String(windowCornerRadius);
    windowCornerRadiusVal.textContent = `${windowCornerRadius}px`;
    applyWindowCornerRadius(windowCornerRadius);
    petAlwaysOnTopInput.checked = cfg.petAlwaysOnTop;
    petVisibleInput.checked = cfg.petVisible;
    petZoomInput.value = String(cfg.petZoom ?? 1);
    petZoomVal.textContent = Math.round((cfg.petZoom ?? 1) * 100) + "%";
    chatLineHeightInput.value = String(cfg.chatLineHeight ?? 1.75);
    chatLineHeightVal.textContent = (cfg.chatLineHeight ?? 1.75).toFixed(2);
    document.documentElement.style.setProperty("--rb-chat-line-height", String(cfg.chatLineHeight ?? 1.75));
    assistantBubbleEnabledInput.checked = cfg.assistantBubbleEnabled ?? false;
    chatParaSpacingInput.value = String(cfg.chatParaSpacing ?? 0.5);
    chatParaSpacingVal.textContent = (cfg.chatParaSpacing ?? 0.5).toFixed(2) + "em";
    document.documentElement.style.setProperty("--rb-chat-para-spacing", (cfg.chatParaSpacing ?? 0.5) + "em");
    disableGpuInput.checked = cfg.disableGpuElectron ?? false;
    sidebarVisibleInput.checked = cfg.sidebarVisible ?? true;
    tasksVisibleInput.checked = cfg.tasksVisible ?? true;
    launchAtLoginInput.checked = cfg.launchAtLogin;
    renderUiFont(normalizeUiFont(cfg.uiFont));
    renderUiIcon(normalizeUiIcon(cfg.uiIcon));
    applyUsageBadgeColorSelection(cfg.usageBadgeColor ?? "");
    applyDefaultChatModeSelection(normalizeDefaultChatMode(cfg.defaultChatMode));
    preferencesState.currentCustomStyleConfig = normalizeCustomStyleConfig(cfg.customStyle);
    applySegmentedOutputSelection(normalizeSegmentedOutputMode(cfg.segmentedOutputMode));
    applyMobileMessageSegmentationSelection(normalizeMobileMessageSegmentationMode(cfg.mobileMessageSegmentation));
    applyProactiveChatSelection(normalizeProactiveChatMode(cfg.proactiveChatMode));
    applyProactiveDeliverySelection(normalizeProactiveDeliveryTarget(cfg.proactiveDeliveryTarget));
    renderProactiveDeliveryVisibility();
    if (screenshotHotkeyInput) {
      screenshotHotkeyInput.value = cfg.screenshotHotkey ?? "Alt+Shift+S";
    }
    void window.settings!.channelsGetStatus()
      .then((status: unknown) => renderProactiveDeliveryAvailability(status as Record<string, { phase?: string }>))
      .catch(() => renderProactiveDeliveryAvailability({}));
    applyLanguageSelection("zh-CN");
    setPreferencesSaveStatus(t("settings.status.waiting"));
    setAppearanceSaveStatus(t("settings.status.waiting"));
    setGeneralSaveStatus(t("settings.status.waiting"));
  } catch {
    setPreferencesSaveStatus(t("settings.status.prefsReadFailed"), "is-error");
    setAppearanceSaveStatus(t("settings.status.appearanceReadFailed"), "is-error");
    setGeneralSaveStatus(t("settings.status.generalReadFailed"), "is-error");
  }
}

async function saveModelConfigPatch(
  patch: Partial<ModelSettings>,
  successText = t("settings.status.applied"),
): Promise<void> {
  try {
    setAppearanceSaveStatus(t("settings.status.applying"));
    await window.settings!.saveConfig(patch);
    setAppearanceSaveStatus(successText, "is-ok");
  } catch (error) {
    console.error("保存模型配置失败:", error);
    setAppearanceSaveStatus(t("settings.status.saveFailed"), "is-error");
  }
}

/** Embedding 维度：留空 = 自动探测；填写则夹到 1~65536。 */
function parseEmbeddingDimensions(): number | undefined {
  const raw = embeddingDimensionsInput?.value?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.max(1, Math.min(65536, Math.round(parsed)));
}

runtimeSyncSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.dataset.value as "off" | "local" | "llm";
    applyRuntimeSyncSelection(value);
    window.settings?.previewRuntimeSync(value);
    void saveModelConfigPatch({ runtimeSync: value });
  });
});

stickerEnabledInput.addEventListener("change", () => {
  void saveModelConfigPatch({ stickerEnabled: stickerEnabledInput.checked });
});

stickerSizeSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.dataset.value;
    const normalized = value === "small" || value === "large" ? value : "standard";
    applyStickerSizeSelection(normalized);
    void saveModelConfigPatch({ stickerSize: normalized });
  });
});

stickerThresholdInput.addEventListener("input", () => {
  stickerThresholdVal.textContent = parseFloat(stickerThresholdInput.value).toFixed(2);
});
stickerThresholdInput.addEventListener("change", () => {
  void saveModelConfigPatch({ stickerSimilarityThreshold: parseFloat(stickerThresholdInput.value) });
});

embeddingDimensionsInput?.addEventListener("change", () => {
  void saveModelConfigPatch({ embeddingDimensions: parseEmbeddingDimensions() });
});

openChromeGpu.addEventListener("click", () => {
  window.settings?.openChromeGpu();
});

disableGpuInput.addEventListener("change", () => {
  void window.settings?.saveGeneral({ disableGpuElectron: disableGpuInput.checked });
});

sidebarVisibleInput.addEventListener("change", () => {
  if (sidebarVisibleInput.checked) window.settings?.openSidebar();
  else window.settings?.closeSidebar();
  void window.settings?.saveGeneral({ sidebarVisible: sidebarVisibleInput.checked });
});

tasksVisibleInput.addEventListener("change", () => {
  if (tasksVisibleInput.checked) window.settings?.openTasks();
  else window.settings?.closeTasks();
  void window.settings?.saveGeneral({ tasksVisible: tasksVisibleInput.checked });
});

windowCornerRadiusInput.addEventListener("input", () => {
  const radius = applyWindowCornerRadius(windowCornerRadiusInput.value);
  windowCornerRadiusVal.textContent = `${radius}px`;
  setAppearanceSaveStatus(t("settings.status.releaseApply"));
});

windowCornerRadiusInput.addEventListener("change", () => {
  const windowCornerRadius = normalizeWindowCornerRadius(windowCornerRadiusInput.value);
  void saveAppearancePatch({ windowCornerRadius });
});

petAlwaysOnTopInput.addEventListener("change", () => {
  window.settings?.setPetAlwaysOnTop(petAlwaysOnTopInput.checked);
  setAppearanceSaveStatus(t("settings.status.appliedOk"), "is-ok");
});

uiFontImportButton.addEventListener("click", async () => {
  try {
    const sourcePath = await window.settings?.pickUiFont();
    if (!sourcePath) return;
    uiFontImportButton.disabled = true;
    setAppearanceSaveStatus(t("settings.status.importingFont"));
    const font = await window.settings!.importUiFont(sourcePath);
    renderUiFont(font);
    setAppearanceSaveStatus(t("settings.status.fontApplied"), "is-ok");
  } catch (error) {
    console.error("导入字体失败:", error);
    setAppearanceSaveStatus(t("settings.status.importFontFailed"), "is-error");
  } finally {
    uiFontImportButton.disabled = false;
  }
});

uiFontResetButton.addEventListener("click", async () => {
  try {
    uiFontResetButton.disabled = true;
    const font = await window.settings!.resetUiFont();
    renderUiFont(font);
    setAppearanceSaveStatus(t("settings.status.fontResetOk"), "is-ok");
  } catch (error) {
    console.error("恢复默认字体失败:", error);
    setAppearanceSaveStatus(t("settings.status.fontResetFailed"), "is-error");
  } finally {
    uiFontResetButton.disabled = false;
  }
});

uiIconSelect.querySelectorAll<HTMLButtonElement>(".appearance-icon-option").forEach((button) => {
  button.addEventListener("click", async () => {
    const icon = normalizeUiIcon(button.dataset.icon);
    try {
      await window.settings!.saveGeneral({ uiIcon: icon });
      renderUiIcon(icon);
      setAppearanceSaveStatus(t("settings.status.iconApplied"), "is-ok");
    } catch (error) {
      console.error("应用图标失败:", error);
      setAppearanceSaveStatus(t("settings.status.iconFailed"), "is-error");
    }
  });
});

petVisibleInput.addEventListener("change", () => {
  window.settings?.setPetVisible(petVisibleInput.checked);
  setAppearanceSaveStatus(t("settings.status.appliedOk"), "is-ok");
});
petZoomInput.addEventListener("input", () => {
  petZoomVal.textContent = Math.round(Number(petZoomInput.value) * 100) + "%";
});
petZoomInput.addEventListener("change", () => {
  window.settings?.setPetZoom(Number(petZoomInput.value));
  setAppearanceSaveStatus(t("settings.status.appliedOk"), "is-ok");
});

// 行间距滑块
chatLineHeightInput.addEventListener("input", () => {
  const val = Number(chatLineHeightInput.value);
  chatLineHeightVal.textContent = val.toFixed(2);
  document.documentElement.style.setProperty("--rb-chat-line-height", String(val));
  setAppearanceSaveStatus(t("settings.status.releaseApply"));
});
chatLineHeightInput.addEventListener("change", () => {
  void saveAppearancePatch({ chatLineHeight: Number(chatLineHeightInput.value) });
});
assistantBubbleEnabledInput.addEventListener("change", () => {
  void saveAppearancePatch({ assistantBubbleEnabled: assistantBubbleEnabledInput.checked });
});
// 段间距滑块
chatParaSpacingInput.addEventListener("input", () => {
  const val = Number(chatParaSpacingInput.value);
  chatParaSpacingVal.textContent = val.toFixed(2) + "em";
  document.documentElement.style.setProperty("--rb-chat-para-spacing", val + "em");
  setAppearanceSaveStatus(t("settings.status.releaseApply"));
});
chatParaSpacingInput.addEventListener("change", () => {
  void saveAppearancePatch({ chatParaSpacing: Number(chatParaSpacingInput.value) });
});

defaultChatModeSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    applyDefaultChatModeSelection(normalizeDefaultChatMode(button.dataset.value));
    setPreferencesSaveStatus(t("settings.status.dirty"));
  });
});

segmentedOutputSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    applySegmentedOutputSelection(normalizeSegmentedOutputMode(button.dataset.value));
    setPreferencesSaveStatus(t("settings.status.dirty"));
  });
});

mobileMessageSegmentationSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    applyMobileMessageSegmentationSelection(normalizeMobileMessageSegmentationMode(button.dataset.value));
    setPreferencesSaveStatus(t("settings.status.dirty"));
  });
});

proactiveChatSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    applyProactiveChatSelection(normalizeProactiveChatMode(button.dataset.value));
    renderProactiveDeliveryVisibility();
    setPreferencesSaveStatus(t("settings.status.dirty"));
  });
});

momentsLivelinessSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    applyMomentsLivelinessSelection(button.dataset.value ?? "quiet");
    setPreferencesSaveStatus(t("settings.status.dirty"));
  });
});

proactiveDeliverySelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    applyProactiveDeliverySelection(normalizeProactiveDeliveryTarget(button.dataset.value));
    setPreferencesSaveStatus(t("settings.status.dirty"));
  });
});

citaEnabledInput.addEventListener("change", () => {
  setPreferencesSaveStatus(t("settings.status.dirty"));
});

apiRuntimeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setRuntimeSaveStatus(t("settings.status.saving"));
  try {
    if (!await saveTimeoutSettings()) return;
    setRuntimeSaveStatus(t("settings.status.saved"), "is-ok");
  } catch {
    setRuntimeSaveStatus(t("settings.status.saveFailed"), "is-error");
  }
});

appearanceForm.addEventListener("submit", (e) => {
  e.preventDefault();
});

generalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setGeneralSaveStatus(t("settings.status.saving"));
  try {
    await window.settings!.saveGeneral({
      disableGpuElectron: disableGpuInput.checked,
      sidebarVisible: sidebarVisibleInput.checked,
      tasksVisible: tasksVisibleInput.checked,
      toastSoundEnabled: toastSoundEnabledInput.checked,
      launchAtLogin: launchAtLoginInput.checked,
      language: "zh-CN",
    });
    setGeneralSaveStatus(t("settings.status.saved"), "is-ok");
  } catch {
    setGeneralSaveStatus(t("settings.status.saveFailed"), "is-error");
  }
});

function switchSection(section: string): void {
  const label = NAV_LABELS[section] ?? NAV_LABELS.general;
  sectionTitle.textContent = label.title;
  sectionHint.textContent = label.hint;

  const isApiAdvanced = section === "api-advanced";
  const isAppearance = section === "appearance";
  const isGeneral = section === "general";
  const isPreferences = section === "preferences";
  const isDisclaimer = section === "disclaimer";
  const isMemory = section === "memory";
  const isZones = section === "zones";
  const isUser = section === "user";
  const isTasks = section === "tasks";
  const isPlugins = section === "plugins";

  const isChannels = section === "channels";
  const isMusic = section === "music";
  apiRuntimeForm.classList.toggle("is-hidden", !isApiAdvanced);
  appearanceForm.classList.toggle("is-hidden", !isAppearance);
  generalForm.classList.toggle("is-hidden", !isGeneral);
  preferencesForm.classList.toggle("is-hidden", !isPreferences);
  disclaimerPanel.classList.toggle("is-hidden", !isDisclaimer);
  const memoryPanel = document.getElementById("memory-panel");
  if (memoryPanel) memoryPanel.classList.toggle("is-hidden", !isMemory);
  // 记忆管理控制台：进面板拉列表、离开面板收起详情与勾选（事件委托只绑一次）
  if (isMemory) void loadMemoryManager();
  else disposeMemoryManager();
  const zonesPanel = document.getElementById("zones-panel");
  if (zonesPanel) zonesPanel.classList.toggle("is-hidden", !isZones);
  if (isZones) void loadZonesPanel();
  else disposeZonesPanel();
  const userPanel = document.getElementById("user-panel");
  if (userPanel) userPanel.classList.toggle("is-hidden", !isUser);
  const tasksPanel = document.getElementById("tasks-panel");
  if (tasksPanel) tasksPanel.classList.toggle("is-hidden", !isTasks);
  if (isTasks) void loadSchedulerPanel();
  pluginsPanel.classList.toggle("is-hidden", !isPlugins);

  const channelsPanel = document.getElementById("channels-panel");
  if (channelsPanel) channelsPanel.classList.toggle("is-hidden", !isChannels);
  if (isChannels) void loadChannelsPanel();
  const musicPanel = document.getElementById("music-panel");
  if (musicPanel) musicPanel.classList.toggle("is-hidden", !isMusic);
  if (isMusic) void loadMusicPanel();
  else disposeMusicPanel();
  placeholderPanel.classList.toggle(
    "is-hidden",
    isApiAdvanced || isAppearance || isGeneral || isPreferences || isDisclaimer || isMemory || isZones || isUser || isTasks || isPlugins || isChannels || isMusic,
  );

  if (
    !isApiAdvanced &&
    !isAppearance &&
    !isGeneral &&
    !isPreferences &&
    !isDisclaimer &&
    !isMemory &&
    !isZones &&
    !isUser &&
    !isTasks &&
    !isPlugins &&
    !isChannels &&
    !isMusic
  ) {
	    placeholderIcon.innerHTML = label.emoji;
    placeholderTitle.textContent = label.title;
    placeholderCopy.textContent = t("settings.placeholder.copy");
  }

  document.querySelectorAll(".nav-item").forEach((el) => {
    const isMatch = (el as HTMLElement).dataset.section === section;
    el.classList.toggle("is-active", isMatch);
  });
  const activeNav = document.querySelector(".nav-item.is-active");
  console.log("[Settings/Trace] switchSection section=", section, "activeNav=", activeNav ? (activeNav as HTMLElement).dataset.section : null);
}

// 供其它面板跳转（例如「连接手机」里的群白名单迁移引导 → 记忆区块）
registerSectionSwitcher(switchSection);

document.querySelectorAll(".nav-item").forEach((el) => {
  el.addEventListener("click", () => {
    const section = (el as HTMLElement).dataset.section;
    if (section) switchSection(section);
  });
});

schedulerNewBtn?.addEventListener("click", () => void openSchedulerEditor());
schedulerEditorClose?.addEventListener("click", closeSchedulerEditor);
schedulerCancelBtn?.addEventListener("click", closeSchedulerEditor);
schedulerSaveBtn?.addEventListener("click", () => void saveSchedulerTask());
schedulerKindInput?.addEventListener("change", updateSchedulerConditionalFields);
schedulerToolLimitInput?.addEventListener("change", updateSchedulerConditionalFields);
updateSchedulerConditionalFields();

void loadGeneralSettings();
// 插件设置面板挂载（已启用且声明了 settingsPanel 的插件按分区挂 iframe）
void mountPluginPanels();
window.settings?.onChannelsStatusChanged((status) => {
  renderProactiveDeliveryAvailability(status as Record<string, { phase?: string }>);
});

// ===== channels panel (连接手机) =====
// 飞书配置输入框（长连接版：只需 App ID + App Secret）
// 微信按钮

// ===== 消息日志 =====

// 首次进入 channels panel 时拉一次日志
// （也可以在用户展开 details 时再拉，但保持简单直接拉）
void loadChannelsPanel();

// ===== 音乐工具面板 =====
// 备注：window.music.* 已在 preload 中通过 contextBridge 暴露。
// 由于 renderer 走 Vite 打包、main/preload 走 esbuild，两端类型不互通，
// 这里直接用 (window as any).music 做弱类型化调用，避免给 global.d.ts 加一堆 cross-bundle 类型。

// ── 网易云折叠卡片状态已移除：外部不显示具体连接状态，只在音乐面板内可见 ──

// 启动时读 URL hash 决定初始标签（main 通过 loadURL 带 #api 实现"切换模型按钮跳 API"）。
// 无 hash 默认 general。
const initialSection = (window.location.hash || "#general").slice(1);
switchSection(initialSection);
// 监听 main 发来的切标签事件（窗口已打开时，main 不重新 loadURL，改发事件）
window.settings?.onSwitchSection?.((section) => {
  switchSection(section);
});
// --- L0/L1 editable logic ---

// Bind edit button events
memoryL0EditBtn?.addEventListener("click", () => {
  if (memoryState.l0Editing) { saveL0(); } else { enterL0EditMode(); }
});
memoryL0CancelBtn?.addEventListener("click", cancelL0Edit);

memoryL1EditBtn?.addEventListener("click", () => {
  if (memoryState.l1Editing) { saveL1(); } else { enterL1EditMode(); }
});
memoryL1CancelBtn?.addEventListener("click", cancelL1Edit);

// ── Obsidian Vault 绑定 UI（逻辑抽离至 ./memory/obsidian-vault-ui）──

initObsidianVaultUI();

memoryImportedList?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement | null;
  const deleteBtn = target?.closest(".memory-record__delete") as HTMLElement | null;
  if (!deleteBtn) return;

  const importId = deleteBtn.dataset.importId || "";
  const fileName = deleteBtn.dataset.fileName || t("settings.importDoc.unnamed");

  const confirmed = await showModal({
    title: t("settings.importDoc.deleteTitle"),
    message: t("settings.importDoc.deleteMessage", { fileName }),
    icon: "⚠️",
    confirmText: t("settings.importDoc.deleteConfirm"),
    cancelText: t("settings.modal.customStyle.cancel"),
  });

  if (!confirmed) return;

  try {
    const result = await window.memoryPanel?.deleteImportedDoc(importId, fileName);
    if (result?.ok) {
      await loadMemoryPanel();
    }
  } catch (err) {
    console.error("[settings] delete imported doc failed", err);
  }
});

void loadMemoryPanel();

// ── 音乐工具手风琴 ─────────────────────────────────────────
musicToggle?.addEventListener("click", () => {
  const expanded = musicToggle?.getAttribute("aria-expanded") === "true";
  musicToggle?.setAttribute("aria-expanded", String(!expanded));
  musicAccordionCard?.classList.toggle("is-expanded", !expanded);
  musicAccordionBody?.classList.toggle("is-collapsed", expanded);
});

// ── 音乐工具路由 ──────────────────────────────────────────────
initLocalMusicPanel();

document.getElementById("music-platform-netease")?.addEventListener("click", () => {
  switchSection("music");
  musicHomeView?.classList.add("is-hidden");
  neteaseDetailView?.classList.remove("is-hidden");
});
musicReturnBtn?.addEventListener("click", () => {
	  switchSection("plugins");
	});

// ── 记忆面板：群聊上下文条数 + 删除全部记忆 + 记忆管理控制台 ──
initGroupContextLimitInput();
initDeleteAllMemoryUI();
initMemoryManagerUI();

// ── 预设卡：选择厂商 = 开始新建档案草稿 ───────────────────────
// ── 偏好设置：聊天社交上下文 / 自定义风格 / 表单提交 ─────────
chatSocialContextEnabledInput.addEventListener("change", () => {
  setPreferencesSaveStatus(t("settings.status.dirty"));
});
momentsEnabledInput.addEventListener("change", () => {
  renderMomentsSubRowsVisibility();
  setPreferencesSaveStatus(t("settings.status.dirty"));
});
cyreneMomentsPostingEnabledInput.addEventListener("change", () => {
  setPreferencesSaveStatus(t("settings.status.dirty"));
});
cyreneMomentsReactionsEnabledInput.addEventListener("change", () => {
  setPreferencesSaveStatus(t("settings.status.dirty"));
});
momentsCharacterReactionsEnabledInput.addEventListener("change", () => {
  setPreferencesSaveStatus(t("settings.status.dirty"));
});

customStyleSamplingBtn?.addEventListener("click", () => {
  openCustomStyleModal();
});

customStylePromptBtn?.addEventListener("click", async () => {
  try {
    const result = await window.settings?.openCustomStylePrompt?.();
    if (!result?.ok) {
      setPreferencesSaveStatus(t("settings.prompt.openFailed"), "is-error");
      return;
    }
    setPreferencesSaveStatus(t("settings.prompt.opened"), "is-ok");
  } catch {
    setPreferencesSaveStatus(t("settings.prompt.openFailed"), "is-error");
  }
});

preferencesForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setPreferencesSaveStatus(t("settings.status.saving"));
  try {
    await window.settings!.saveGeneral({
      citaEnabled: citaEnabledInput.checked,
      citaSemanticEngine: "remote",
      chatSocialContextEnabled: chatSocialContextEnabledInput.checked,
      momentsEnabled: momentsEnabledInput.checked,
      cyreneMomentsPostingEnabled: cyreneMomentsPostingEnabledInput.checked,
      cyreneMomentsReactionsEnabled: cyreneMomentsReactionsEnabledInput.checked,
      momentsCharacterReactionsEnabled: momentsCharacterReactionsEnabledInput.checked,
      momentsLiveliness: getMomentsLivelinessValue(),
      defaultChatMode: "chat",
      segmentedOutputMode: "off",
      mobileMessageSegmentation: getMobileMessageSegmentationValue(),
      proactiveChatMode: getProactiveChatValue(),
      proactiveDeliveryTarget: getProactiveDeliveryValue(),
      screenshotHotkey: screenshotHotkeyInput?.value || "Alt+Shift+S",
    });
    setPreferencesSaveStatus(t("settings.status.saved"), "is-ok");
  } catch {
    setPreferencesSaveStatus(t("settings.status.saveFailed"), "is-error");
  }
});
