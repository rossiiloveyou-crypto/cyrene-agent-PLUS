// Timeout 面板业务逻辑：超时配置加载 / 保存 / 重置按钮绑定
// 从 settings.ts 抽离。依赖 timeout DOM 引用（./dom）、api DOM 引用（../api/dom，复用 modelRequestTimeoutSec*）。
//
// 「测试超时」（testTimeout）输入框随旧「API 设置」面板一起迁到了聊天窗口的 API 配置区，
// 设置窗口不再有该字段，因此这里只负责「询问等待时间 / 模型请求超时 / 工具并发数」。

import {
  timeoutUserChoiceInput, timeoutUserChoiceReset,
  maxParallelToolCallsInput,
} from "./dom";
import { modelRequestTimeoutSecInput, modelRequestTimeoutSecReset } from "../api/dom";
import { setRuntimeSaveStatus } from "../shared/save-status";
import { parsePositiveIntOrThrow } from "../shared/parse";
import type { TimeoutSettings } from "../../../shared/timeout-types";

export async function loadTimeoutSettings(): Promise<void> {
  try {
    const cfg = await window.settings!.getTimeoutSettings();
    timeoutUserChoiceInput.value = String(cfg.userChoiceTimeout / 1000);
    modelRequestTimeoutSecInput.value = cfg.modelRequestTimeoutSec != null ? String(cfg.modelRequestTimeoutSec) : "";
    const generalSettings = await window.settings!.getGeneral();
    maxParallelToolCallsInput.value = String(generalSettings.maxParallelToolCalls ?? 4);
    setRuntimeSaveStatus("时间设置保存后，对后续请求生效。");
  } catch {
    setRuntimeSaveStatus("读取偏好失败", "is-error");
  }
}

export async function saveTimeoutSettings(): Promise<boolean> {
  let settings: Partial<TimeoutSettings>;
  try {
    settings = {
      userChoiceTimeout: 1000 * parsePositiveIntOrThrow(timeoutUserChoiceInput.value, "询问等待时间"),
      modelRequestTimeoutSec: modelRequestTimeoutSecInput.value === "" ? undefined : parsePositiveIntOrThrow(modelRequestTimeoutSecInput.value, "模型请求超时"),
    };
  } catch (e) {
    setRuntimeSaveStatus("无效输入：" + e, "is-error");
    return false;
  }
  try {
    await window.settings!.saveTimeoutSettings(settings);
    const requested = Number(maxParallelToolCallsInput.value);
    await window.settings!.saveGeneral({
      maxParallelToolCalls: Number.isFinite(requested) ? requested : 4,
    });
    setRuntimeSaveStatus("已保存", "is-ok");
    return true;
  } catch {
    setRuntimeSaveStatus("保存失败", "is-error");
  }
  return false;
}

// ===== 重置按钮事件绑定（模块加载时执行） =====
timeoutUserChoiceReset.addEventListener("click", () => { timeoutUserChoiceInput.value = "60" });
modelRequestTimeoutSecReset.addEventListener("click", () => { modelRequestTimeoutSecInput.value = "" });

// 模块加载时拉一次配置
void loadTimeoutSettings();
