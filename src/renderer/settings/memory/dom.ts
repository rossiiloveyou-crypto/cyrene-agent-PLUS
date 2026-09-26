// Memory 面板 DOM 引用
// 从 settings.ts 抽离。ESM 静态导入保证查询在 settings.ts 顶层代码之前执行。

export const memoryL0NameInput = document.getElementById("memory-l0-name") as HTMLInputElement | null;
export const memoryL0OccupationInput = document.getElementById("memory-l0-occupation") as HTMLInputElement | null;
export const memoryL0InterestsInput = document.getElementById("memory-l0-interests") as HTMLInputElement | null;
export const memoryL0LanguageInput = document.getElementById("memory-l0-language") as HTMLInputElement | null;
export const memoryL0NoteInput = document.getElementById("memory-l0-note") as HTMLTextAreaElement | null;
export const memoryL1GoalsInput = document.getElementById("memory-l1-goals") as HTMLTextAreaElement | null;
export const memoryL1PreferencesInput = document.getElementById("memory-l1-preferences") as HTMLTextAreaElement | null;
export const memoryL1ProjectInput = document.getElementById("memory-l1-project") as HTMLTextAreaElement | null;
export const memoryL2SearchInput = document.getElementById("memory-l2-search") as HTMLInputElement | null;
export const memoryL2List = document.getElementById("memory-l2-list") as HTMLElement | null;
export const memoryImportedList = document.getElementById("memory-imported-list") as HTMLElement | null;
export const memoryReflectionList = document.getElementById("memory-reflection-list") as HTMLElement | null;
export const memoryL0EditBtn = document.getElementById("memory-l0-edit-btn") as HTMLButtonElement | null;
export const memoryL0CancelBtn = document.getElementById("memory-l0-cancel-btn") as HTMLButtonElement | null;
export const memoryL1EditBtn = document.getElementById("memory-l1-edit-btn") as HTMLButtonElement | null;
export const memoryL1CancelBtn = document.getElementById("memory-l1-cancel-btn") as HTMLButtonElement | null;
export const obsidianVaultBindBtn = document.getElementById("obsidian-vault-bind-btn") as HTMLButtonElement | null;
export const obsidianVaultUnbound = document.getElementById("obsidian-vault-unbound") as HTMLElement | null;
export const obsidianVaultBound = document.getElementById("obsidian-vault-bound") as HTMLElement | null;
export const obsidianVaultPath = document.getElementById("obsidian-vault-path") as HTMLElement | null;
export const obsidianVaultSyncBtn = document.getElementById("obsidian-vault-sync-btn") as HTMLButtonElement | null;
export const obsidianVaultUnbindBtn = document.getElementById("obsidian-vault-unbind-btn") as HTMLButtonElement | null;
export const obsidianVaultAutoSync = document.getElementById("obsidian-vault-auto-sync") as HTMLInputElement | null;
export const obsidianVaultHint = document.getElementById("obsidian-vault-hint") as HTMLParagraphElement | null;
// RAG / 文档导入卡片已并入记忆面板：Embedding 维度输入
export const embeddingDimensionsInput = document.getElementById("embedding-dimensions-input") as HTMLInputElement | null;
// 群聊上下文条数（写入通用设置 groupContextLimit）与保存状态
export const memoryGroupContextLimitInput = document.getElementById("memory-group-context-limit") as HTMLInputElement | null;
export const memoryGroupContextStatus = document.getElementById("memory-group-context-status") as HTMLElement | null;
// 删除全部记忆（危险操作，二次确认在 ./delete-all）
export const memoryDeleteAllBtn = document.getElementById("memory-delete-all-btn") as HTMLButtonElement | null;
// 记忆管理控制台（P3，业务逻辑在 ./manager 与 ./erasure-flow）
export const memoryManagerViewPeople = document.getElementById("memory-manager-view-people") as HTMLButtonElement | null;
export const memoryManagerViewZones = document.getElementById("memory-manager-view-zones") as HTMLButtonElement | null;
export const memoryManagerViewSessions = document.getElementById("memory-manager-view-sessions") as HTMLButtonElement | null;
export const memoryManagerRefreshBtn = document.getElementById("memory-manager-refresh-btn") as HTMLButtonElement | null;
export const memoryManagerFeedback = document.getElementById("memory-manager-feedback") as HTMLElement | null;
export const memoryManagerList = document.getElementById("memory-manager-list") as HTMLElement | null;
export const memoryManagerBatchBar = document.getElementById("memory-manager-batch-bar") as HTMLElement | null;
export const memoryManagerBatchCount = document.getElementById("memory-manager-batch-count") as HTMLElement | null;
export const memoryManagerBatchDeleteBtn = document.getElementById("memory-manager-batch-delete-btn") as HTMLButtonElement | null;
export const memoryManagerDetail = document.getElementById("memory-manager-detail") as HTMLElement | null;
export const memoryManagerDetailTitle = document.getElementById("memory-manager-detail-title") as HTMLElement | null;
export const memoryManagerDetailSummary = document.getElementById("memory-manager-detail-summary") as HTMLElement | null;
export const memoryManagerDetailCloseBtn = document.getElementById("memory-manager-detail-close-btn") as HTMLButtonElement | null;
export const memoryManagerDetailList = document.getElementById("memory-manager-detail-list") as HTMLElement | null;
export const memoryManagerDetailDeleteBtn = document.getElementById("memory-manager-detail-delete-btn") as HTMLButtonElement | null;
export const memoryManagerEraseBtn = document.getElementById("memory-manager-erase-btn") as HTMLButtonElement | null;
export const memoryManagerTrace = document.getElementById("memory-manager-trace") as HTMLElement | null;
