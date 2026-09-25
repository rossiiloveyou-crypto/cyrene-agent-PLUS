// Timeout 面板 DOM 引用
// 从 settings.ts 抽离。ESM 静态导入保证查询在 settings.ts 顶层代码之前执行。
//
// 注意：原先这里的 #timeout-test / #timeout-test-reset-btn（「测试超时」）属于旧「API 设置」
// 面板；该面板已整体迁移到聊天窗口「模型」页签的 API 配置区（见
// react/features/chat/components/api-config），设置窗口里已不存在这两个元素，
// 故一并移除，避免模块加载时对 null 调用 addEventListener 导致整个设置页初始化中断。

export const timeoutUserChoiceInput = document.getElementById("timeout-user-choice") as HTMLInputElement;
export const timeoutUserChoiceReset = document.getElementById("timeout-user-choice-reset-btn") as HTMLButtonElement;
export const maxParallelToolCallsInput = document.getElementById("max-parallel-tool-calls") as HTMLInputElement;
