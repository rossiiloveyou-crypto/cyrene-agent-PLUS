/**
 * 「彻底擦除」三段式的**阶段机**（纯逻辑，可测）。
 *
 * 从 `MemoryManagerSection` 抽出的原因（= H-22 的教训）：
 * 该缺陷不是算错数，而是**两个 Modal 的 `open` 绑了同一份状态**，
 * 于是「预演」与「强确认」同开、确认框压住预演 ⇒ 用户看不到「会删什么」就要打确认短语。
 * 这类「哪个面板该开」的判断一旦写在 JSX 里就**没有测试面**（该组件当时 0 渲染测试覆盖），
 * 所以把它提成纯函数，用测试钉死。
 *
 * 阶段：`preview`（看清楚会删什么）→ 用户显式点「我已了解，继续」→ `confirm`（打短语）。
 * 任一环节都可取消；从确认框「返回」退回预演而不是整体放弃。
 */

export type EraseStep = "preview" | "confirm";

/**
 * 擦除流程的会话状态（与组件里 `erase` state 的语义一致）。
 *
 * 对 `plan` 泛型化：本模块只关心**阶段**，不该把 `PersonErasePlan` 的具体结构拉进来
 * （那会让它依赖 `settings/shared/types`）。组件侧实例化为 `EraseFlowState<PersonErasePlan>`。
 */
export interface EraseFlowState<Plan = unknown> {
  /** 预演方案（含 `previewId`，执行前必须非空）。 */
  plan: Plan;
  /** 用户在确认框里手打的短语（严格相等判定，`trim` 不算数）。 */
  typed: string;
  /** 「预演之后又新增记忆」的重来轮次。 */
  round: number;
  step: EraseStep;
}

/**
 * 两个 Modal 的可见性 —— **必须互斥**。
 *
 * 返回值恒为「至多一个 true、且都不开时整体隐藏」，这正是 H-22 要求的串行语义。
 */
export function eraseModalVisibility(step: EraseStep | null | undefined): {
  previewOpen: boolean;
  confirmOpen: boolean;
} {
  return {
    previewOpen: step === "preview",
    confirmOpen: step === "confirm",
  };
}

/** 首次（或重新）预演：总是回到 `preview`，绝不直接进确认框。 */
export function startEraseFlow<Plan>(plan: Plan, round = 0): EraseFlowState<Plan> {
  return { plan, typed: "", round, step: "preview" };
}

/** 预演「我已了解，继续」→ 进确认框。**保留已输入的短语**（重确认时用户不必重打）。 */
export function continueFromPreview<Plan>(state: EraseFlowState<Plan> | null): EraseFlowState<Plan> | null {
  if (!state) return null;
  return { ...state, step: "confirm" };
}

/** 确认框「返回预演」：退回看清内容，而不是丢掉整个流程。 */
export function backToPreview<Plan>(state: EraseFlowState<Plan> | null): EraseFlowState<Plan> | null {
  if (!state) return null;
  return { ...state, step: "preview" };
}

/** 用户手打短语（只在确认阶段有意义）。 */
export function typeErasePhrase<Plan>(state: EraseFlowState<Plan> | null, typed: string): EraseFlowState<Plan> | null {
  if (!state) return null;
  return { ...state, typed };
}

/** 彻底取消（两个弹窗都关）。 */
export function cancelEraseFlow(): null {
  return null;
}
