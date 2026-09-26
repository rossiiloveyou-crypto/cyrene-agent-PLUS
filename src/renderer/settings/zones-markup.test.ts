// 记忆区块（Zones）面板的 markup / i18n 守卫：
// - 侧边栏入口、面板骨架、卡片位置（记忆面板两张新卡 + 危险卡片置底）
// - 「连接手机」的群白名单输入区已移除，只剩跳转引导
// - 新文案在 zh-CN（权威）与 en 里都存在（HTML 的 data-i18n 用短 key，资源在 settings.* 下）

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("./index.html", import.meta.url)), "utf8");
const zhCN = JSON.parse(readFileSync(fileURLToPath(new URL("./i18n/zh-CN.json", import.meta.url)), "utf8")) as Record<string, unknown>;
const en = JSON.parse(readFileSync(fileURLToPath(new URL("./i18n/en.json", import.meta.url)), "utf8")) as Record<string, unknown>;

function posOf(marker: string): number {
  const index = html.indexOf(marker);
  if (index < 0) throw new Error(`markup 缺少锚点: ${marker}`);
  return index;
}

function lookup(resource: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (!node || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[part];
  }, resource);
}

/** 取某个 <section id="x"> 的完整片段。 */
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

/** 该片段里用到的所有 data-i18n* key。 */
function i18nKeysIn(slice: string): string[] {
  return Array.from(new Set(
    [...slice.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g)].map((match) => match[1]),
  ));
}

describe("侧边栏「记忆区块」入口", () => {
  it("入口紧跟「记忆」，并带 18x18 图标与文案", () => {
    const memory = posOf('data-section="memory"');
    const zones = posOf('data-section="zones"');
    expect(zones).toBeGreaterThan(memory);
    expect(zones).toBeLessThan(posOf('data-section="user"'));

    const navItem = html.slice(html.lastIndexOf("<button", zones), html.indexOf("</button>", zones));
    expect(navItem).toContain('data-i18n="nav.zones"');
    expect(navItem).toContain('width="18" height="18"');
    expect(navItem).toContain('stroke="currentColor"');
  });
});

describe("记忆区块面板骨架", () => {
  it("面板挂在记忆面板之后、用户面板之前", () => {
    const zones = posOf('id="zones-panel"');
    expect(zones).toBeGreaterThan(posOf('id="memory-panel"'));
    expect(zones).toBeLessThan(posOf('id="user-panel"'));
  });

  it("包含新建按钮、批量条与列表容器", () => {
    const slice = panelSlice("zones-panel");
    expect(slice).toContain('data-panel="zones"');
    expect(slice).toContain('class="settings-panel is-hidden"');
    for (const id of ["zones-create-btn", "zones-batch-bar", "zones-batch-count", "zones-batch-move-btn", "zones-batch-remove-btn", "zones-list"]) {
      expect(slice).toContain(`id="${id}"`);
    }
    // 批量条默认隐藏（勾选成员后才出现）
    expect(slice).toMatch(/id="zones-batch-bar"[^>]*class="zones-batch-actions is-hidden"|class="zones-batch-actions is-hidden" id="zones-batch-bar"/);
  });
});

describe("记忆面板新增卡片", () => {
  it("群聊上下文卡片在 L2 之后、「导入知识」之前", () => {
    const groupContext = posOf('id="memory-group-context-limit"');
    expect(groupContext).toBeGreaterThan(posOf('id="memory-l2-list"'));
    expect(groupContext).toBeLessThan(posOf('data-i18n="panel.memory.imported.title"'));
  });

  it("群聊上下文输入框带 3~50 约束", () => {
    const input = html.slice(posOf('id="memory-group-context-limit"'));
    const tag = input.slice(0, input.indexOf("/>"));
    expect(tag).toContain('min="3"');
    expect(tag).toContain('max="50"');
    expect(tag).toContain('type="number"');
  });

  it("删除全部记忆卡片在最底部，且用危险样式", () => {
    const deleteAll = posOf('id="memory-delete-all-btn"');
    expect(html).toContain("memory-card--danger");
    expect(html).toContain("ghost-btn ghost-btn--danger");
    // 在 obsidian 卡片之后（即记忆面板最后一张卡）
    expect(deleteAll).toBeGreaterThan(posOf('id="obsidian-vault-unbind-btn"'));
    expect(deleteAll).toBeLessThan(posOf('id="user-panel"'));
  });
});

describe("「连接手机」群白名单迁移", () => {
  it("旧的群号 / 群 openid 白名单输入区已移除", () => {
    expect(html).not.toContain('id="channels-qq-group-allowlist"');
    expect(html).not.toContain('id="channels-qqbot-group-allowlist"');
    expect(html).not.toContain("panel.channels.qqGroupAllowlist");
    expect(html).not.toContain("panel.channels.qqBotGroupAllowlist");
  });

  it("改为说明 + 「前往记忆区块」按钮（QQ 与 QQ 官方机器人各一个）", () => {
    for (const id of ["channels-qq-zone-migration", "channels-qqbot-zone-migration"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('data-i18n="panel.channels.zoneMigration.desc"');
    expect(html).toContain('data-i18n="panel.channels.zoneMigration.button"');
    expect(html.match(/panel\.channels\.zoneMigration\.desc/g)).toHaveLength(2);
  });
});

describe("废弃的「清空记录」", () => {
  it("通用设置里不再有清空聊天记录行", () => {
    expect(html).not.toContain('id="clear-chat-history-btn"');
    expect(html).not.toContain("panel.general.chatHistory.");
  });
});

describe("新增文案在 zh-CN 与 en 中都存在", () => {
  // 「连接手机」里只取迁移引导块本身，避免连带检查同卡片里既有的历史缺词
  const migrationBlocks = [...html.matchAll(/<p class="channels-card__hint channels-card__hint--migration">[\s\S]*?<\/div>/g)]
    .map((match) => match[0]);
  const slices = [
    panelSlice("zones-panel"),
    html.slice(posOf('data-i18n="panel.memory.groupContext.title"'), posOf('data-i18n="panel.memory.imported.title"')),
    html.slice(posOf('data-i18n="panel.memory.deleteAll.title"'), posOf('id="memory-delete-all-btn"')),
    ...migrationBlocks,
  ];

  it("zh-CN 是权威语言包：每个 key 都有非空字符串", () => {
    for (const slice of slices) {
      for (const key of i18nKeysIn(slice)) {
        const value = lookup(zhCN, `settings.${key}`);
        expect(typeof value, `zh-CN 缺少 ${key}`).toBe("string");
        expect((value as string).length, `zh-CN 的 ${key} 为空`).toBeGreaterThan(0);
      }
    }
  });

  it("en 补齐同 key", () => {
    for (const slice of slices) {
      for (const key of i18nKeysIn(slice)) {
        const value = lookup(en, `settings.${key}`);
        expect(typeof value, `en 缺少 ${key}`).toBe("string");
        expect((value as string).length, `en 的 ${key} 为空`).toBeGreaterThan(0);
      }
    }
  });
});

describe("区块面板运行时引用的 i18n key 都有翻译", () => {
  // 上一组用例靠手写清单，容易漏（例如渠道清单里的 key 是拼出来的）。
  // 这里直接从源码里把 settings.panel.zones.* 的字面量抓出来，作为强制口径：
  // 代码里出现过的 key，两份语言包都必须有。
  const keys = new Set<string>();
  for (const file of ["zones/panel.ts", "zones/picker.ts", "zones/manual-group.ts"]) {
    const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
    for (const match of source.matchAll(/"(settings\.panel\.zones\.[A-Za-z0-9_.]+)"/g)) keys.add(match[1]);
  }

  it("确实抓到了 key（守卫自身不能静默失效）", () => {
    expect(keys.size).toBeGreaterThan(30);
  });

  it("zh-CN 与 en 都齐全且非空", () => {
    for (const key of keys) {
      for (const [name, resource] of [["zh-CN", zhCN], ["en", en]] as const) {
        const value = lookup(resource, key);
        expect(typeof value, `${name} 缺少 ${key}`).toBe("string");
        expect((value as string).length, `${name} 的 ${key} 为空`).toBeGreaterThan(0);
      }
    }
  });
});

describe("废弃词条已清理", () => {
  it("chatHistory 的中英文词条都删掉了", () => {
    expect(lookup(zhCN, "settings.chatHistory")).toBeUndefined();
    expect(lookup(zhCN, "settings.panel.general.chatHistory")).toBeUndefined();
  });

  it("旧白名单词条已删除", () => {
    expect(lookup(zhCN, "settings.panel.channels.qqGroupAllowlist")).toBeUndefined();
    expect(lookup(zhCN, "settings.panel.channels.qqGroupAllowlistPlaceholder")).toBeUndefined();
    expect(lookup(zhCN, "settings.panel.channels.qqBotGroupAllowlist")).toBeUndefined();
  });

  it("新词条齐全（面板运行时用到的 settings.* key）", () => {
    for (const key of [
      "settings.nav.zones",
      "settings.nav.zonesHint",
      "settings.panel.zones.heading",
      "settings.panel.zones.subheading",
      "settings.panel.zones.createButton",
      "settings.panel.zones.batchMove",
      "settings.panel.zones.batchRemove",
      "settings.panel.zones.addMember",
      "settings.panel.zones.deleteZone",
      "settings.panel.zones.rename",
      "settings.panel.zones.removeMember",
      "settings.panel.zones.observeGroupMessages",
      "settings.panel.zones.injectOwnerProfile",
      "settings.panel.zones.rootAutoDesktop",
      "settings.panel.zones.privateMapping",
      "settings.panel.zones.privateMappingNone",
      "settings.panel.zones.empty",
      "settings.panel.zones.pickMemberTitle",
      "settings.panel.zones.pickMemberDesc",
      "settings.panel.zones.pickMemberEmpty",
      "settings.panel.zones.manualGroup.button",
      "settings.panel.zones.manualGroup.buttonHint",
      "settings.panel.zones.manualGroup.pickChannelTitle",
      "settings.panel.zones.manualGroup.pickChannelDesc",
      "settings.panel.zones.manualGroup.pickChannelEmpty",
      "settings.panel.zones.manualGroup.channel.qq",
      "settings.panel.zones.manualGroup.channel.qqNote",
      "settings.panel.zones.manualGroup.channel.qqbot",
      "settings.panel.zones.manualGroup.channel.qqbotNote",
      "settings.panel.zones.manualGroup.promptTitle",
      "settings.panel.zones.manualGroup.message.qq",
      "settings.panel.zones.manualGroup.message.qqbot",
      "settings.panel.zones.manualGroup.placeholder.qq",
      "settings.panel.zones.manualGroup.placeholder.qqbot",
      "settings.panel.zones.manualGroup.confirm",
      "settings.panel.zones.manualGroup.errorEmpty",
      "settings.panel.zones.manualGroup.errorFormat",
      "settings.panel.zones.manualGroup.added",
      "settings.panel.zones.manualGroup.addedMoved",
      "settings.panel.zones.moveTitle",
      "settings.panel.zones.moveDesc",
      "settings.panel.zones.batchCount",
      "settings.panel.zones.batchMoveDone",
      "settings.panel.zones.batchMoveFailed",
      "settings.panel.zones.batchRemoveDone",
      "settings.panel.zones.batchRemoveFailed",
      "settings.panel.zones.addedMember",
      "settings.panel.zones.removedMember",
      "settings.panel.zones.actionFailed",
      "settings.panel.zones.loadFailed",
      "settings.panel.zones.loadFailedHint",
      "settings.panel.zones.untitledConversation",
      "settings.panel.zones.selectMember",
      "settings.panel.zones.memberCount",
      "settings.panel.zones.cancel",
      "settings.panel.zones.badge.desktop",
      "settings.panel.zones.badge.private",
      "settings.panel.zones.badge.group",
      "settings.panel.zones.create.title",
      "settings.panel.zones.create.message",
      "settings.panel.zones.create.placeholder",
      "settings.panel.zones.create.confirm",
      "settings.panel.zones.renamePrompt.title",
      "settings.panel.zones.renamePrompt.message",
      "settings.panel.zones.renamePrompt.confirm",
      "settings.panel.zones.delete.title",
      "settings.panel.zones.delete.message",
      "settings.panel.zones.delete.confirm",
      "settings.panel.memory.groupContext.title",
      "settings.panel.memory.groupContext.desc",
      "settings.panel.memory.groupContext.hint",
      "settings.panel.memory.groupContext.field",
      "settings.panel.memory.groupContext.saved",
      "settings.panel.memory.groupContext.saveFailed",
      "settings.panel.memory.deleteAll.title",
      "settings.panel.memory.deleteAll.desc",
      "settings.panel.memory.deleteAll.hint",
      "settings.panel.memory.deleteAll.button",
      "settings.panel.memory.deleteAll.confirmTitle",
      "settings.panel.memory.deleteAll.confirmMessage",
      "settings.panel.memory.deleteAll.confirmPhrase",
      "settings.panel.memory.deleteAll.confirmButton",
      "settings.panel.memory.deleteAll.cancelButton",
      "settings.panel.memory.deleteAll.doneTitle",
      "settings.panel.memory.deleteAll.doneMessage",
      "settings.panel.memory.deleteAll.restartButton",
      "settings.panel.memory.deleteAll.laterButton",
      "settings.panel.memory.deleteAll.failedTitle",
      "settings.panel.memory.deleteAll.failedMessage",
      "settings.panel.memory.deleteAll.failedConfirm",
      "settings.panel.channels.zoneMigration.desc",
      "settings.panel.channels.zoneMigration.button",
    ]) {
      expect(typeof lookup(zhCN, key), `zh-CN 缺少 ${key}`).toBe("string");
      expect(typeof lookup(en, key), `en 缺少 ${key}`).toBe("string");
    }
  });
});
