import type { AppUpdateState } from "../../../../shared/app-update";

/**
 * 更新状态 → 界面展示的唯一映射。
 *
 * 这里只产出文案 key 和动作标识，不直接做翻译；组件层用 t() 翻译，
 * 保证主进程错误码（check_failed / download_failed）到用户文案的转换只有这一处。
 */
export interface AppUpdateView {
  /** 状态文案的 i18n key 及插值参数 */
  label: { key: string; params?: Record<string, string | number> };
  /** 主按钮触发的动作；null 表示该状态没有可点的按钮 */
  action: "check" | "download" | "install" | "retry" | null;
  /** 动作文案的 i18n key */
  actionLabel: string | null;
  /** 检查中 / 下载中：按钮应显示忙碌且不可点 */
  busy: boolean;
  /** 头像红点是否该亮：发现有新版本到安装完成之间都算"有待处理的更新" */
  badge: boolean;
}

/** 主进程已知的错误码；未知码按通用失败文案兜底 */
const KNOWN_ERROR_CODES = new Set(["check_failed", "download_failed"]);

export function resolveAppUpdateView(state: AppUpdateState): AppUpdateView {
  switch (state.phase) {
    case "idle":
      return { label: { key: "appUpdate.idle" }, action: "check", actionLabel: "appUpdate.checkAction", busy: false, badge: false };
    case "checking":
      return { label: { key: "appUpdate.checking" }, action: null, actionLabel: null, busy: true, badge: false };
    case "available":
      return {
        label: state.availableVersion
          ? { key: "appUpdate.availableWithVersion", params: { version: state.availableVersion } }
          : { key: "appUpdate.available" },
        action: "download",
        actionLabel: "appUpdate.downloadAction",
        busy: false,
        badge: true,
      };
    case "downloading":
      return {
        label: { key: "appUpdate.downloading", params: { percent: Math.max(0, Math.min(100, Math.round(state.percent ?? 0))) } },
        action: null,
        actionLabel: null,
        busy: true,
        badge: true,
      };
    case "downloaded":
      return { label: { key: "appUpdate.downloaded" }, action: "install", actionLabel: "appUpdate.restartAction", busy: false, badge: true };
    case "not_available":
      return { label: { key: "appUpdate.upToDate" }, action: "check", actionLabel: "appUpdate.checkAction", busy: false, badge: false };
    case "error": {
      const code = state.error && KNOWN_ERROR_CODES.has(state.error) ? state.error : "default";
      return { label: { key: `appUpdate.error.${code}` }, action: "retry", actionLabel: "appUpdate.retryAction", busy: false, badge: false };
    }
  }
}

/** 版本 → 纪念称号文案 key；想让某个版本带头衔（如 1.3.0 的"正式版"）就加一行 */
const VERSION_TITLE_KEYS: Record<string, string> = {
  "1.3.0": "ui.version.firstStable",
};

/** 查版本称号：有条目返回文案 key（组件层用 t() 翻译），普通版本返回 null 只显示 v 号 */
export function resolveVersionTitleKey(version: string): string | null {
  return VERSION_TITLE_KEYS[version] ?? null;
}

/** 官网地址：设置页关于行与头像菜单共用，走 system.openExternal 在默认浏览器打开 */
export const WEBSITE_URL = "https://playaagentcyrene.online/";
