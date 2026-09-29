// Modal 共享状态
// 从 settings.ts 顶层 let 抽离，收进单一对象。
// 被语义反馈入口（showNotice/showAlert/showConfirm）与富文本/输入弹窗共用。

import type { AlertOptions, ConfirmOptions } from "../../shared/feedback-types";

/** 富文本模态框选项（内容为调用方负责的受信 HTML） */
export interface HtmlModalOptions {
  title: string;
  htmlBody: string;
  icon?: string;
  confirmText?: string;
}

/** 输入模态框选项（Electron 禁用了 window.prompt 的自绘实现） */
export interface InputModalOptions {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  /**
   * 确认门控：传入后，输入框内容必须**严格等于**该值，确认按钮才可点。
   * 用于「删除全部记忆」这类不可撤销操作（防误触，不只靠"点两下"）。
   */
  confirmValue?: string;
}

/**
 * 阻塞弹窗请求：alert 单按钮 / confirm 双按钮 / html 富文本 / input 输入。
 * 四种弹窗共用同一条先进先出队列与单实例互斥，保证同一窗口任意时刻只有一个阻塞弹窗。
 */
export type BlockingDialogRequest =
  | { kind: "alert"; options: AlertOptions; resolve: () => void }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "html"; options: HtmlModalOptions; resolve: () => void }
  | { kind: "input"; options: InputModalOptions; resolve: (value: string | null) => void };

export const modalState = {
  cyOverlay: null as HTMLElement | null,
  cyHtmlOverlay: null as HTMLElement | null,
  cyInputOverlay: null as HTMLElement | null,
  /** 轻提示堆叠容器（.cy-notice-stack） */
  noticeContainer: null as HTMLElement | null,
  /** 阻塞弹窗先进先出队列 */
  blockingQueue: [] as BlockingDialogRequest[],
  /** 是否有阻塞弹窗正在展示 */
  blockingActive: false,
};
