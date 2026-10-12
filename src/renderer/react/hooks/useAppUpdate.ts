import { useEffect, useState } from "react";
import type { AppUpdateState } from "../../../shared/app-update";

/**
 * 订阅主进程应用更新状态：挂载时取一次当前值，之后跟着主进程推送走。
 * 头像红点和设置页"软件更新"行共用这一个数据源。
 */
export function useAppUpdate(): AppUpdateState {
  const [state, setState] = useState<AppUpdateState>({ phase: "idle", currentVersion: "" });

  useEffect(() => {
    const api = window.appUpdate;
    if (!api) return;
    let active = true;
    void api.getState().then((next) => {
      if (active) setState(next);
    });
    const unsubscribe = api.onStateChanged((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
