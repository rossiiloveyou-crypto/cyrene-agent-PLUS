// @vitest-environment jsdom
//
// 记忆区块面板：渲染（root 卡片只读、成员徽章、私聊映射）+ 交互（选择器、批量条、离开面板清理）。
// 布局骨架直接取真实 index.html 的 #zones-panel，避免测试和线上 markup 漂移。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ZonesSnapshot } from "../shared/types";

// jsdom 环境下 import.meta.url 不是 file: 协议，按仓库既有写法用 __dirname 定位
const html = readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

/** 取 index.html 里某个面板的完整片段（按同名标签深度配平）。 */
function panelSlice(id: string): string {
  const idIndex = html.indexOf(`id="${id}"`);
  if (idIndex < 0) throw new Error(`找不到面板 ${id}`);
  const openIndex = html.lastIndexOf("<", idIndex);
  const openTagEnd = html.indexOf(">", idIndex) + 1;
  const pattern = /<section\b|<\/section>/g;
  pattern.lastIndex = openTagEnd;
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

function makeSnapshot(over: Partial<ZonesSnapshot> = {}): ZonesSnapshot {
  return {
    zones: [
      {
        zoneId: "root",
        zoneName: "desktop",
        isRoot: true,
        createdAt: 1,
        members: [],
        config: { observeGroupMessages: true, injectOwnerProfile: true },
      },
      {
        zoneId: "zone_a",
        zoneName: "家人群",
        isRoot: false,
        createdAt: 2,
        members: [
          { kind: "external", sessionId: "channel:qq:group", channel: "qq", chatId: "20001", chatType: "group", senderName: "家族群" },
        ],
        config: { observeGroupMessages: true, injectOwnerProfile: false },
      },
    ],
    externalChats: [
      { sessionId: "channel:qq:group", channel: "qq", chatId: "20001", chatType: "group", senderName: "家族群", lastAt: 10 },
      { sessionId: "channel:qq:fresh", channel: "qq", chatId: "30003", chatType: "group", lastAt: 30 },
    ],
    conversations: [{ id: "conv1", title: "和昔涟的对话", mode: "chat", updatedAt: 5 }],
    ...over,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(htmlText: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = htmlText;
  document.body.append(host);
  return host;
}

async function loadPanelModule() {
  vi.resetModules();
  return await import("./panel");
}

async function mountAndLoad(snapshot: ZonesSnapshot) {
  const getZoneSnapshot = vi.fn(async () => snapshot);
  Object.assign(window, { memoryPanel: { getZoneSnapshot } });
  const mod = await loadPanelModule();
  await mod.loadZonesPanel();
  await flush();
  return { mod, getZoneSnapshot };
}

beforeEach(() => {
  document.body.replaceChildren();
  mount(panelSlice("zones-panel"));
  vi.restoreAllMocks();
});

describe("记忆区块卡片渲染", () => {
  it("root 卡片不可删除、不可改名，并说明自动包含全部桌面对话", () => {
    return loadPanelModule().then(({ renderZoneCard }) => {
      const snapshot = makeSnapshot();
      const host = mount(renderZoneCard(snapshot.zones[0], snapshot));
      const card = host.querySelector(".zone-card")!;
      expect(card.querySelector('[data-zone-action="delete-zone"]')).toBeNull();
      expect(card.querySelector('[data-zone-action="rename-zone"]')).toBeNull();
      expect(card.textContent).toContain("自动包含全部桌面对话");
      // 只读列出桌面对话：勾选框与移出按钮都不该出现
      expect(card.textContent).toContain("和昔涟的对话");
      expect(card.querySelectorAll('input[data-zone-member]')).toHaveLength(0);
      expect(card.querySelector('[data-zone-action="remove-member"]')).toBeNull();
    });
  });

  it("root 的「注入我的画像」恒为开且禁用，旁听开关可改", async () => {
    const { renderZoneCard } = await loadPanelModule();
    const snapshot = makeSnapshot();
    const host = mount(renderZoneCard(snapshot.zones[0], snapshot));
    const inject = host.querySelector<HTMLInputElement>('input[data-zone-config="injectOwnerProfile"]')!;
    expect(inject.checked).toBe(true);
    expect(inject.disabled).toBe(true);
    const observe = host.querySelector<HTMLInputElement>('input[data-zone-config="observeGroupMessages"]')!;
    expect(observe.disabled).toBe(false);
  });

  it("自定义区块有重命名与删除按钮，且没有 root 专属说明", async () => {
    const { renderZoneCard } = await loadPanelModule();
    const snapshot = makeSnapshot();
    const host = mount(renderZoneCard(snapshot.zones[1], snapshot));
    expect(host.querySelector('[data-zone-action="rename-zone"]')).not.toBeNull();
    expect(host.querySelector('[data-zone-action="delete-zone"]')).not.toBeNull();
    expect(host.textContent).not.toContain("自动包含全部桌面对话");
    const inject = host.querySelector<HTMLInputElement>('input[data-zone-config="injectOwnerProfile"]')!;
    expect(inject.disabled).toBe(false);
  });

  it("成员徽章把 root 自动包含的桌面对话算进去", async () => {
    const { renderZoneCard, zoneMemberCount } = await loadPanelModule();
    const snapshot = makeSnapshot();
    expect(zoneMemberCount(snapshot.zones[0], snapshot)).toBe(1); // 1 个桌面对话
    expect(zoneMemberCount(snapshot.zones[1], snapshot)).toBe(1); // 1 个外部成员
    const host = mount(renderZoneCard(snapshot.zones[0], snapshot));
    expect(host.querySelector(".zone-card__badge")?.textContent).toBe("1 个成员");
  });

  it("每张卡片都有「手动加群」入口（新群唯一能加白的路径）", async () => {
    const { renderZoneCard } = await loadPanelModule();
    const snapshot = makeSnapshot();
    for (const zone of snapshot.zones) {
      const card = mount(renderZoneCard(zone, snapshot));
      const button = card.querySelector('[data-zone-action="add-group-manual"]');
      expect(button, `${zone.zoneId} 缺少手动加群按钮`).not.toBeNull();
      expect(button?.textContent).toContain("手动加群");
      expect(button?.getAttribute("title")).toContain("白名单");
    }
  });

  it("手动加的群先用群号显示，渠道补齐群名后自动换成群名", async () => {
    const { renderZoneCard } = await loadPanelModule();
    const base = makeSnapshot();
    const manualMember = {
      kind: "external" as const,
      sessionId: "channel:qq:manual",
      channel: "qq",
      chatId: "987654321",
      chatType: "group" as const,
    };
    const withManual: ZonesSnapshot = {
      ...base,
      zones: [base.zones[0], { ...base.zones[1], members: [manualMember] }],
      externalChats: [
        ...base.externalChats,
        { sessionId: "channel:qq:manual", channel: "qq", chatId: "987654321", chatType: "group", lastAt: 40 },
      ],
    };
    const rows = () => mount(renderZoneCard(withManual.zones[1], withManual)).querySelectorAll(".zone-member-row__name");
    expect(rows()[0]?.textContent).toBe("987654321");

    // 群里说过话之后 context-bindings 记下了群名：成员行自动显示群名而不是群号
    const named: ZonesSnapshot = {
      ...withManual,
      externalChats: withManual.externalChats.map((chat) =>
        chat.sessionId === "channel:qq:manual" ? { ...chat, senderName: "远房亲戚群" } : chat),
    };
    const host = mount(renderZoneCard(named.zones[1], named));
    expect(host.querySelector(".zone-member-row__name")?.textContent).toBe("远房亲戚群");
    expect(host.textContent).toContain("987654321"); // 群号仍显示在 id 列
  });

  it("私聊映射：有私聊成员显示昵称，没有私聊成员显示「未绑定」", async () => {
    const { renderZoneCard, describePrivateMapping } = await loadPanelModule();
    const snapshot = makeSnapshot({
      zones: [
        {
          ...makeSnapshot().zones[0],
          members: [
            { kind: "external", sessionId: "channel:qq:priv", channel: "qq", chatId: "10001", chatType: "private", senderName: "小明" },
          ],
        },
        makeSnapshot().zones[1],
      ],
    });
    expect(describePrivateMapping(snapshot, snapshot.zones[0])).toContain("小明");
    // 镜像功能已删除：说明里不再指向任何桌面对话
    expect(describePrivateMapping(snapshot, snapshot.zones[0])).not.toContain("和昔涟的对话");
    expect(describePrivateMapping(snapshot, snapshot.zones[0])).not.toContain("桌面双向镜像");
    const card = mount(renderZoneCard(snapshot.zones[0], snapshot));
    expect(card.textContent).toContain("小明");
    // 没有私聊成员时是「未绑定」
    expect(describePrivateMapping(makeSnapshot(), makeSnapshot().zones[0])).toContain("未绑定");
  });
});

describe("记忆区块面板交互", () => {
  it("加载后渲染所有区块，批量条默认隐藏", async () => {
    await mountAndLoad(makeSnapshot());
    const list = document.getElementById("zones-list")!;
    expect(list.querySelectorAll(".zone-card")).toHaveLength(2);
    expect(document.getElementById("zones-batch-bar")!.classList.contains("is-hidden")).toBe(true);
  });

  it("「添加成员」选择器只列外部会话，不含桌面对话", async () => {
    await mountAndLoad(makeSnapshot());
    const customCard = document.querySelector('.zone-card[data-zone-id="zone_a"]')!;
    (customCard.querySelector('[data-zone-action="add-member"]') as HTMLElement).click();

    const overlay = document.getElementById("zones-picker-overlay")!;
    expect(overlay.classList.contains("is-hidden")).toBe(false);
    const items = Array.from(overlay.querySelectorAll<HTMLElement>("button[data-picker-key]"));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.dataset.pickerKey!.startsWith("external:")).toBe(true);
    }
    expect(overlay.textContent).not.toContain("和昔涟的对话");
    // 已在目标区块里的成员置灰
    const existing = items.find((item) => item.dataset.pickerKey === "external:channel:qq:group") as HTMLButtonElement;
    expect(existing.disabled).toBe(true);
  });

  it("勾选成员后出现批量条，取消勾选后消失", async () => {
    await mountAndLoad(makeSnapshot());
    const checkbox = document.querySelector<HTMLInputElement>('input[data-zone-member]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    const bar = document.getElementById("zones-batch-bar")!;
    expect(bar.classList.contains("is-hidden")).toBe(false);
    expect(document.getElementById("zones-batch-count")!.textContent).toBe("已选 1 个");

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    expect(bar.classList.contains("is-hidden")).toBe(true);
  });

  it("批量「移动到…」把选中的成员交给 moveZoneMembers", async () => {
    const snapshot = makeSnapshot();
    const moveZoneMembers = vi.fn(async () => ({ moved: 1, errors: [] as string[] }));
    const getZoneSnapshot = vi.fn(async () => snapshot);
    Object.assign(window, { memoryPanel: { getZoneSnapshot, moveZoneMembers } });
    const mod = await loadPanelModule();
    await mod.loadZonesPanel();
    await flush();

    const checkbox = document.querySelector<HTMLInputElement>('input[data-zone-member]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    (document.getElementById("zones-batch-move-btn") as HTMLElement).click();

    const target = document.querySelector<HTMLElement>('#zones-picker-overlay button[data-picker-key="root"]')!;
    target.click();
    await flush();

    expect(moveZoneMembers).toHaveBeenCalledTimes(1);
    const [targetZoneId, members] = moveZoneMembers.mock.calls[0];
    expect(targetZoneId).toBe("root");
    expect(members).toEqual([
      { kind: "external", sessionId: "channel:qq:group", channel: "qq", chatId: "20001", chatType: "group", senderName: "家族群" },
    ]);
  });

  it("后端拒绝时把错误原样展示（例如 root 私聊映射已满）", async () => {
    const snapshot = makeSnapshot();
    const addZoneMember = vi.fn(async () => ({ ok: false as const, error: "root 区块只能有一个私聊映射" }));
    const getZoneSnapshot = vi.fn(async () => snapshot);
    Object.assign(window, { memoryPanel: { getZoneSnapshot, addZoneMember } });
    const mod = await loadPanelModule();
    await mod.loadZonesPanel();
    await flush();

    const customCard = document.querySelector('.zone-card[data-zone-id="zone_a"]')!;
    (customCard.querySelector('[data-zone-action="add-member"]') as HTMLElement).click();
    document.querySelector<HTMLElement>('#zones-picker-overlay button[data-picker-key="external:channel:qq:fresh"]')!.click();
    await flush();

    expect(addZoneMember).toHaveBeenCalledTimes(1);
    const feedback = document.getElementById("zones-feedback")!;
    expect(feedback.textContent).toContain("root 区块只能有一个私聊映射");
    expect(feedback.classList.contains("zones-feedback--err")).toBe(true);
  });

  it("「手动加群」：选渠道 → 输群号 → 调 addZoneManualGroup（新群唯一能加白的入口）", async () => {
    const snapshot = makeSnapshot();
    const addZoneManualGroup = vi.fn(async () => ({
      ok: true as const,
      zone: snapshot.zones[1],
      sessionId: "channel:qq:computed",
      movedFrom: null,
    }));
    const getZoneSnapshot = vi.fn(async () => snapshot);
    Object.assign(window, { memoryPanel: { getZoneSnapshot, addZoneManualGroup } });
    const mod = await loadPanelModule();
    await mod.loadZonesPanel();
    await flush();

    const customCard = document.querySelector('.zone-card[data-zone-id="zone_a"]')!;
    (customCard.querySelector('[data-zone-action="add-group-manual"]') as HTMLElement).click();

    // 第一步：渠道选择器（两个支持群白名单的渠道）
    const picker = document.getElementById("zones-picker-overlay")!;
    expect(picker.classList.contains("is-hidden")).toBe(false);
    const channels = Array.from(picker.querySelectorAll<HTMLElement>("button[data-picker-key]"));
    expect(channels.map((item) => item.dataset.pickerKey)).toEqual(["qq", "qqbot"]);

    // 第二步：输入弹窗（图标必须是 SVG 元素，不能是那串标记文字）
    (picker.querySelector<HTMLElement>('button[data-picker-key="qq"]')!).click();
    await flush();
    const inputOverlay = document.getElementById("cy-input-overlay")!;
    expect(inputOverlay.classList.contains("is-hidden")).toBe(false);
    expect(document.getElementById("cy-input-icon")!.querySelector("svg")).not.toBeNull();

    const field = document.getElementById("cy-input-field") as HTMLInputElement;
    field.value = " 987654321 ";
    (document.getElementById("cy-input-confirm") as HTMLElement).click();
    await flush();

    expect(addZoneManualGroup).toHaveBeenCalledTimes(1);
    // 主进程只收规范化后的群号，sessionId 由它自己算
    expect(addZoneManualGroup).toHaveBeenCalledWith("zone_a", "qq", "987654321");
    expect(document.getElementById("zones-feedback")!.textContent).toContain("987654321");
  });

  it("「手动加群」：格式不对时不发请求，直接给提示", async () => {
    const snapshot = makeSnapshot();
    const addZoneManualGroup = vi.fn();
    const getZoneSnapshot = vi.fn(async () => snapshot);
    Object.assign(window, { memoryPanel: { getZoneSnapshot, addZoneManualGroup } });
    const mod = await loadPanelModule();
    await mod.loadZonesPanel();
    await flush();

    (document.querySelector('.zone-card[data-zone-id="zone_a"] [data-zone-action="add-group-manual"]') as HTMLElement).click();
    (document.querySelector<HTMLElement>('#zones-picker-overlay button[data-picker-key="qq"]')!).click();
    await flush();

    const field = document.getElementById("cy-input-field") as HTMLInputElement;
    field.value = "不是群号";
    (document.getElementById("cy-input-confirm") as HTMLElement).click();
    await flush();

    expect(addZoneManualGroup).not.toHaveBeenCalled();
    const feedback = document.getElementById("zones-feedback")!;
    expect(feedback.textContent).toContain("格式");
    expect(feedback.classList.contains("zones-feedback--err")).toBe(true);
  });

  it("「手动加群」：群原本在别的区块时把来源说出来", async () => {
    const snapshot = makeSnapshot();
    const addZoneManualGroup = vi.fn(async () => ({
      ok: true as const,
      zone: snapshot.zones[1],
      sessionId: "channel:qq:computed",
      movedFrom: { zoneId: "root", zoneName: "desktop" },
    }));
    const getZoneSnapshot = vi.fn(async () => snapshot);
    Object.assign(window, { memoryPanel: { getZoneSnapshot, addZoneManualGroup } });
    const mod = await loadPanelModule();
    await mod.loadZonesPanel();
    await flush();

    (document.querySelector('.zone-card[data-zone-id="zone_a"] [data-zone-action="add-group-manual"]') as HTMLElement).click();
    (document.querySelector<HTMLElement>('#zones-picker-overlay button[data-picker-key="qq"]')!).click();
    await flush();
    (document.getElementById("cy-input-field") as HTMLInputElement).value = "123456789";
    (document.getElementById("cy-input-confirm") as HTMLElement).click();
    await flush();

    const feedback = document.getElementById("zones-feedback")!;
    expect(feedback.textContent).toContain("desktop");
    expect(feedback.classList.contains("zones-feedback--ok")).toBe(true);
  });

  it("「手动加群」：后端拒绝时原样展示错误", async () => {
    const snapshot = makeSnapshot();
    const addZoneManualGroup = vi.fn(async () => ({ ok: false as const, error: "群标识无效（请检查渠道与群号格式）" }));
    const getZoneSnapshot = vi.fn(async () => snapshot);
    Object.assign(window, { memoryPanel: { getZoneSnapshot, addZoneManualGroup } });
    const mod = await loadPanelModule();
    await mod.loadZonesPanel();
    await flush();

    (document.querySelector('.zone-card[data-zone-id="zone_a"] [data-zone-action="add-group-manual"]') as HTMLElement).click();
    (document.querySelector<HTMLElement>('#zones-picker-overlay button[data-picker-key="qqbot"]')!).click();
    await flush();
    (document.getElementById("cy-input-field") as HTMLInputElement).value = "A1B2C3D4E5F6A7B8";
    (document.getElementById("cy-input-confirm") as HTMLElement).click();
    await flush();

    expect(addZoneManualGroup).toHaveBeenCalledWith("zone_a", "qqbot", "A1B2C3D4E5F6A7B8");
    expect(document.getElementById("zones-feedback")!.textContent).toContain("群标识无效");
  });

  it("离开面板时清空勾选、收起弹层与批量条", async () => {
    const { mod } = await mountAndLoad(makeSnapshot());
    const checkbox = document.querySelector<HTMLInputElement>('input[data-zone-member]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector<HTMLElement>('.zone-card[data-zone-id="zone_a"] [data-zone-action="add-member"]')!.click();
    expect(document.getElementById("zones-picker-overlay")!.classList.contains("is-hidden")).toBe(false);

    mod.disposeZonesPanel();

    expect(document.getElementById("zones-picker-overlay")!.classList.contains("is-hidden")).toBe(true);
    expect(document.getElementById("zones-batch-bar")!.classList.contains("is-hidden")).toBe(true);
  });

  it("读取失败时给出失败态而不是空白面板", async () => {
    const getZoneSnapshot = vi.fn(async () => {
      throw new Error("ipc boom");
    });
    Object.assign(window, { memoryPanel: { getZoneSnapshot } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await loadPanelModule();
    await mod.loadZonesPanel();
    await flush();
    expect(document.getElementById("zones-list")!.textContent).toContain("失败");
  });
});
