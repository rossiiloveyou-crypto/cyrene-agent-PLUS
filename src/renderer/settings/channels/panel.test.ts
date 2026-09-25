// @vitest-environment jsdom
//
// 「连接手机」面板：群白名单输入区已迁到「记忆区块」。
// 两个必须锁住的行为：
//   1. 保存配置时不再回写 allowedGroupIds / allowedGroupOpenids（主进程 saveConfig 走对象合并，
//      不带这两个字段 = 旧配置原样保留；一旦回写空数组就会把用户旧白名单清空）。
//   2. 迁移按钮真的能跳到记忆区块。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const html = readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

function panelSlice(id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) throw new Error(`找不到面板 ${id}`);
  const openIndex = html.lastIndexOf("<", start);
  const pattern = /<section\b|<\/section>/g;
  pattern.lastIndex = html.indexOf(">", start) + 1;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[0] === "</section>") {
      depth -= 1;
      if (depth === 0) return html.slice(openIndex, match.index);
    } else {
      depth += 1;
    }
  }
  throw new Error(`面板 ${id} 未闭合`);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function channelsApi(over: Record<string, unknown> = {}) {
  return {
    channelsGetConfig: vi.fn(async () => ({
      wechat: {},
      feishu: {},
      qq: { enabled: true, listenMode: "auto", port: 6200, allowedGroupIds: ["20001"] },
      qqbot: { enabled: true, appId: "102146862", allowedUserOpenids: [], allowedGroupOpenids: ["OPENGROUP1"] },
    })),
    channelsSaveConfig: vi.fn(async () => ({})),
    channelsRestart: vi.fn(async () => ({ ok: true })),
    channelsGetStatus: vi.fn(async () => ({})),
    channelsLogGet: vi.fn(async () => []),
    onChannelsInstallProgress: vi.fn(() => () => {}),
    onChannelsStatusChanged: vi.fn(() => () => {}),
    onChannelsWechatQrcode: vi.fn(() => () => {}),
    onChannelsWechatLoginDone: vi.fn(() => () => {}),
    ...over,
  };
}

async function mountChannelsPanel(api: Record<string, unknown>, switcher?: (section: string) => void) {
  Object.assign(window, { settings: api });
  vi.resetModules();
  // resetModules 之后要拿「同一份」section-nav 模块实例注册，否则面板用的是另一个副本
  const nav = await import("../shared/section-nav");
  if (switcher) nav.registerSectionSwitcher(switcher);
  const mod = await import("./panel");
  await mod.loadChannelsPanel();
  await flush();
  return mod;
}

beforeEach(() => {
  document.body.innerHTML = `${panelSlice("channels-panel")}<div id="proactive-delivery-select"></div>`;
  vi.restoreAllMocks();
});

describe("群白名单迁移：保存配置不再写旧字段", () => {
  it("QQ（NapCat）保存时不带 allowedGroupIds", async () => {
    const api = channelsApi();
    await mountChannelsPanel(api);

    (document.getElementById("channels-qq-save") as HTMLElement).click();
    await flush();

    expect(api.channelsSaveConfig).toHaveBeenCalledTimes(1);
    const patch = api.channelsSaveConfig.mock.calls[0][0] as { qq: Record<string, unknown> };
    expect(patch.qq).toBeTruthy();
    expect("allowedGroupIds" in patch.qq).toBe(false);
  });

  it("QQ 官方机器人保存时不带 allowedGroupOpenids（单聊 openid 白名单照旧写入）", async () => {
    const api = channelsApi();
    await mountChannelsPanel(api);

    (document.getElementById("channels-qqbot-save") as HTMLElement).click();
    await flush();

    expect(api.channelsSaveConfig).toHaveBeenCalledTimes(1);
    const patch = api.channelsSaveConfig.mock.calls[0][0] as { qqbot: Record<string, unknown> };
    expect("allowedGroupOpenids" in patch.qqbot).toBe(false);
    expect("allowedUserOpenids" in patch.qqbot).toBe(true);
  });
});

describe("群白名单迁移：引导按钮", () => {
  it("两个迁移按钮都跳到记忆区块", async () => {
    const switchSection = vi.fn();
    await mountChannelsPanel(channelsApi(), switchSection);

    (document.getElementById("channels-qq-zone-migration") as HTMLElement).click();
    (document.getElementById("channels-qqbot-zone-migration") as HTMLElement).click();

    expect(switchSection).toHaveBeenCalledTimes(2);
    expect(switchSection).toHaveBeenNthCalledWith(1, "zones");
    expect(switchSection).toHaveBeenNthCalledWith(2, "zones");
  });

  it("入口模块尚未注册时退化为点击导航项", async () => {
    const nav = document.createElement("button");
    nav.className = "nav-item";
    nav.dataset.section = "zones";
    const navClick = vi.fn();
    nav.addEventListener("click", navClick);
    document.body.append(nav);

    // 不注册 switcher：等价于 settings.ts 入口尚未执行到 registerSectionSwitcher
    await mountChannelsPanel(channelsApi());

    (document.getElementById("channels-qq-zone-migration") as HTMLElement).click();
    expect(navClick).toHaveBeenCalledTimes(1);
  });
});
