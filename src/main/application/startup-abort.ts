/**
 * 启动中止哨兵。
 *
 * 有些启动期分支不是"失败"，而是"用户主动选择不继续"（例如记忆格式升级时选了
 * 退出应用）。这类中止不应该弹错误框，但同样必须让启动流程停下并受控退出。
 */

export const STARTUP_ABORT_CODE = "E_STARTUP_ABORTED";

export class StartupAbortedError extends Error {
  readonly code = STARTUP_ABORT_CODE;

  constructor(reason: string) {
    super(reason);
    this.name = "StartupAbortedError";
  }
}

export function isStartupAborted(error: unknown): boolean {
  return (
    error instanceof StartupAbortedError
    || (typeof error === "object"
      && error !== null
      && (error as { code?: unknown }).code === STARTUP_ABORT_CODE)
  );
}
