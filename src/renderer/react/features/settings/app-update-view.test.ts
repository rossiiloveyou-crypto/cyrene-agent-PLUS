import { describe, expect, it } from "vitest";
import { resolveAppUpdateView } from "./app-update-view";

describe("resolveAppUpdateView", () => {
  it("maps every phase to a translatable view", () => {
    // 未检查过：可以发起检查，红点不亮
    expect(resolveAppUpdateView({ phase: "idle", currentVersion: "1.1.7" })).toMatchObject({
      label: { key: "appUpdate.idle" },
      action: "check",
      badge: false,
    });

    // 检查中：忙碌、无按钮、红点不亮
    expect(resolveAppUpdateView({ phase: "checking", currentVersion: "1.1.7" })).toMatchObject({
      label: { key: "appUpdate.checking" },
      action: null,
      busy: true,
      badge: false,
    });

    // 已是最新：可以再查
    expect(resolveAppUpdateView({ phase: "not_available", currentVersion: "1.1.7" })).toMatchObject({
      label: { key: "appUpdate.upToDate" },
      action: "check",
      badge: false,
    });
  });

  it("lights the badge and offers the download action when a release is available", () => {
    expect(resolveAppUpdateView({
      phase: "available",
      currentVersion: "1.1.7",
      availableVersion: "1.2.0",
    })).toMatchObject({
      label: { key: "appUpdate.availableWithVersion", params: { version: "1.2.0" } },
      action: "download",
      actionLabel: "appUpdate.downloadAction",
      badge: true,
    });

    // 没拿到版本号时退回通用文案
    expect(resolveAppUpdateView({ phase: "available", currentVersion: "1.1.7" })).toMatchObject({
      label: { key: "appUpdate.available" },
    });
  });

  it("keeps the badge on while downloading and clamps the percent", () => {
    expect(resolveAppUpdateView({
      phase: "downloading",
      currentVersion: "1.1.7",
      percent: 42.4,
    })).toMatchObject({
      label: { key: "appUpdate.downloading", params: { percent: 42 } },
      action: null,
      busy: true,
      badge: true,
    });

    expect(resolveAppUpdateView({
      phase: "downloading",
      currentVersion: "1.1.7",
      percent: 999,
    })).toMatchObject({ label: { params: { percent: 100 } } });
  });

  it("offers install once the update is downloaded", () => {
    expect(resolveAppUpdateView({
      phase: "downloaded",
      currentVersion: "1.1.7",
      availableVersion: "1.2.0",
      percent: 100,
    })).toMatchObject({
      label: { key: "appUpdate.downloaded" },
      action: "install",
      actionLabel: "appUpdate.restartAction",
      badge: true,
    });
  });

  it("translates known error codes and falls back for unknown ones", () => {
    expect(resolveAppUpdateView({
      phase: "error",
      currentVersion: "1.1.7",
      error: "check_failed",
    })).toMatchObject({
      label: { key: "appUpdate.error.check_failed" },
      action: "retry",
      badge: false,
    });

    expect(resolveAppUpdateView({
      phase: "error",
      currentVersion: "1.1.7",
      error: "something_new",
    })).toMatchObject({ label: { key: "appUpdate.error.default" } });
  });
});
