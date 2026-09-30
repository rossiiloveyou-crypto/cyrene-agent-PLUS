// P9 T2 新增测试：覆盖从 H-07 保留的 3 个「里子」模块抄写出来的纯规则。
//
// 为什么必须新写：`memory/{delete-all,erasure-flow,manager}.ts` 在 P4 删掉旧设置窗后就
// **没有任何测试覆盖**，而它们的纯判定逻辑正是「删他的话、留关于他的话」「二次确认门」
// 这类**不可回退动作**的门禁。抄到 React 侧就必须把门禁一起测回来。
//
// 测试口径与里子模块逐条对齐（见 rules.ts 顶部的出处对照表）。

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canErasePersonKey,
  canProceedToErase,
  classifyManagerMemory,
  DEFAULT_GROUP_CONTEXT_LIMIT,
  describeDeleteAllFailure,
  groupManagerMemories,
  isDeleteAllConfirmed,
  isEraseConfirmed,
  isGroupContextLimitValid,
  MAX_ERASE_RECONFIRM_ROUNDS,
  MAX_GROUP_CONTEXT_LIMIT,
  MIN_GROUP_CONTEXT_LIMIT,
  nextEraseStep,
  normalizeGroupContextLimit,
  zoneMemberKey,
  zoneMemberLabel,
} from "./rules";

describe("记忆管理台规则 · 二次确认门", () => {
  it("严格相等才放行（与 delete-all.ts:22 同口径）", () => {
    expect(isDeleteAllConfirmed("删除全部记忆", "删除全部记忆")).toBe(true);
    expect(isDeleteAllConfirmed("删除全部记忆 ", "删除全部记忆")).toBe(false);
    expect(isDeleteAllConfirmed(" 删除全部记忆", "删除全部记忆")).toBe(false);
    expect(isDeleteAllConfirmed("删除", "删除全部记忆")).toBe(false);
    expect(isDeleteAllConfirmed("", "删除全部记忆")).toBe(false);
    expect(isDeleteAllConfirmed("DELETE", "删除全部记忆")).toBe(false);
  });

  it("擦除确认与删除全部记忆同一口径（含 trim 不算数）", () => {
    expect(isEraseConfirmed("彻底擦除", "彻底擦除")).toBe(true);
    expect(isEraseConfirmed("彻底擦除\n", "彻底擦除")).toBe(false);
    expect(isEraseConfirmed("彻底擦除 ", "彻底擦除")).toBe(false);
  });

  it("确认短语为空时只有空输入能过（防 i18n 缺键导致门禁失效）", () => {
    // 这条钉住一个真实风险：短语来源一旦取不到值，门禁会退化成"随便点都能过"
    expect(isDeleteAllConfirmed("随便什么", "")).toBe(false);
    expect(isDeleteAllConfirmed("", "")).toBe(true);
  });
});

describe("记忆管理台规则 · personKey 合法性", () => {
  it("只接受 <channel>:<senderId> 形态（与主进程 parsePersonKey 同判据）", () => {
    expect(canErasePersonKey("qq:12345")).toBe(true);
    expect(canErasePersonKey("wechat:wxid_abc")).toBe(true);
    expect(canErasePersonKey("qq:")).toBe(true);
  });

  it("拒绝空值、未归属占位符与无渠道前缀的裸 id", () => {
    expect(canErasePersonKey("")).toBe(false);
    expect(canErasePersonKey("__unattributed__")).toBe(false);
    expect(canErasePersonKey("12345")).toBe(false);
    expect(canErasePersonKey("qq-12345")).toBe(false);
  });
});

describe("记忆管理台规则 · own / mentioned 分组", () => {
  it("只有 subjectIds 命中、speakerIds 不命中才算「别人提到他」", () => {
    expect(classifyManagerMemory({ speakerIds: ["qq:1"], subjectIds: [] }, "qq:1")).toBe("own");
    expect(classifyManagerMemory({ speakerIds: [], subjectIds: ["qq:1"] }, "qq:1")).toBe("mentioned");
    // 两个字段都命中 → 优先算 he 说的（R2 优先）
    expect(classifyManagerMemory({ speakerIds: ["qq:1"], subjectIds: ["qq:1"] }, "qq:1")).toBe("own");
    // 两个都没命中 → 来自他的私聊会话（私聊即人）
    expect(classifyManagerMemory({ speakerIds: [], subjectIds: [] }, "qq:1")).toBe("own");
    expect(classifyManagerMemory({ speakerIds: ["qq:2"], subjectIds: ["qq:2"] }, "qq:1")).toBe("own");
  });

  it("缺字段（undefined）不抛错，按 own 处理", () => {
    expect(classifyManagerMemory({}, "qq:1")).toBe("own");
    expect(classifyManagerMemory({ speakerIds: undefined, subjectIds: undefined }, "qq:1")).toBe("own");
  });

  it("没有 personKey 时一律 own（非按人视图 / 未选人）", () => {
    expect(classifyManagerMemory({ subjectIds: ["qq:1"] }, undefined)).toBe("own");
    expect(classifyManagerMemory({ subjectIds: ["qq:1"] }, "")).toBe("own");
  });

  it("按人视图才分组；容器视图全部落 own 组且不丢条目", () => {
    const memories = [
      { id: "a", speakerIds: ["qq:1"], subjectIds: [] },
      { id: "b", speakerIds: [], subjectIds: ["qq:1"] },
      { id: "c", speakerIds: [], subjectIds: [] },
    ];
    const people = groupManagerMemories(memories, "people", "qq:1");
    expect(people.own.map((m) => m.id)).toEqual(["a", "c"]);
    expect(people.mentioned.map((m) => m.id)).toEqual(["b"]);

    for (const view of ["zones", "sessions"] as const) {
      const grouped = groupManagerMemories(memories, view, "qq:1");
      expect(grouped.own.map((m) => m.id)).toEqual(["a", "b", "c"]);
      expect(grouped.mentioned).toEqual([]);
    }
  });

  it("分组不丢条目：两组条数之和恒等于输入条数", () => {
    const memories = Array.from({ length: 17 }, (_, i) => ({
      id: String(i),
      speakerIds: i % 3 === 0 ? ["qq:1"] : [],
      subjectIds: i % 3 === 1 ? ["qq:1"] : [],
    }));
    const { own, mentioned } = groupManagerMemories(memories, "people", "qq:1");
    expect(own.length + mentioned.length).toBe(memories.length);
  });
});

describe("记忆管理台规则 · 三段式擦除守卫链", () => {
  const phrase = "彻底擦除";

  it("四个条件全部满足才放行到 erasePerson", () => {
    expect(canProceedToErase({ personKey: "qq:1", previewId: "p-1", typed: phrase, phrase })).toBe(true);
  });

  it("取消（typed = null）不放行", () => {
    expect(canProceedToErase({ personKey: "qq:1", previewId: "p-1", typed: null, phrase })).toBe(false);
  });

  it("确认短语不严格相等不放行", () => {
    expect(canProceedToErase({ personKey: "qq:1", previewId: "p-1", typed: `${phrase} `, phrase })).toBe(false);
    expect(canProceedToErase({ personKey: "qq:1", previewId: "p-1", typed: "", phrase })).toBe(false);
  });

  it("缺 previewId 不放行（预演失败/被跳过时绝不能执行）", () => {
    expect(canProceedToErase({ personKey: "qq:1", previewId: undefined, typed: phrase, phrase })).toBe(false);
    expect(canProceedToErase({ personKey: "qq:1", previewId: "", typed: phrase, phrase })).toBe(false);
  });

  it("personKey 非法不放行（即便确认短语打对了）", () => {
    expect(canProceedToErase({ personKey: "12345", previewId: "p-1", typed: phrase, phrase })).toBe(false);
    expect(canProceedToErase({ personKey: "__unattributed__", previewId: "p-1", typed: phrase, phrase })).toBe(false);
  });

  it("needsReconfirm 的回归轮数与上限", () => {
    expect(nextEraseStep({ needsReconfirm: false }, 0)).toBe("done");
    expect(nextEraseStep({ needsReconfirm: true }, 0)).toBe("reconfirm");
    expect(nextEraseStep({ needsReconfirm: true }, MAX_ERASE_RECONFIRM_ROUNDS - 1)).toBe("reconfirm");
    expect(nextEraseStep({ needsReconfirm: true }, MAX_ERASE_RECONFIRM_ROUNDS)).toBe("limit");
    // 超过上限也必须收敛到 limit，不能重新回到 reconfirm（否则会无限循环）
    expect(nextEraseStep({ needsReconfirm: true }, MAX_ERASE_RECONFIRM_ROUNDS + 5)).toBe("limit");
  });
});

describe("记忆管理台规则 · 群聊近期上下文条数", () => {
  const fallback = 10;
  const min = 3;
  const max = 50;

  it("越界值被夹到 [3, 50]（与主进程 normalizeGroupContextLimit 同语义）", () => {
    expect(normalizeGroupContextLimit(1, fallback, min, max)).toBe(3);
    expect(normalizeGroupContextLimit(0, fallback, min, max)).toBe(3);
    expect(normalizeGroupContextLimit(-99, fallback, min, max)).toBe(3);
    expect(normalizeGroupContextLimit(999, fallback, min, max)).toBe(50);
    expect(normalizeGroupContextLimit(3, fallback, min, max)).toBe(3);
    expect(normalizeGroupContextLimit(50, fallback, min, max)).toBe(50);
    expect(normalizeGroupContextLimit(10, fallback, min, max)).toBe(10);
  });

  it("小数四舍五入、字符串数字可接受、非数字回落默认值", () => {
    expect(normalizeGroupContextLimit(10.4, fallback, min, max)).toBe(10);
    expect(normalizeGroupContextLimit(10.6, fallback, min, max)).toBe(11);
    expect(normalizeGroupContextLimit("12", fallback, min, max)).toBe(12);
    expect(normalizeGroupContextLimit("abc", fallback, min, max)).toBe(fallback);
    expect(normalizeGroupContextLimit(Number.NaN, fallback, min, max)).toBe(fallback);
    expect(normalizeGroupContextLimit(Number.POSITIVE_INFINITY, fallback, min, max)).toBe(fallback);
    // null / "" / 空白是"没填"，必须回落默认值，**不能**经 Number(null)=0 被夹成 min
    expect(normalizeGroupContextLimit(null, fallback, min, max)).toBe(fallback);
    expect(normalizeGroupContextLimit(undefined, fallback, min, max)).toBe(fallback);
    expect(normalizeGroupContextLimit("", fallback, min, max)).toBe(fallback);
    expect(normalizeGroupContextLimit("   ", fallback, min, max)).toBe(fallback);
    expect(normalizeGroupContextLimit({}, fallback, min, max)).toBe(fallback);
    expect(normalizeGroupContextLimit([], fallback, min, max)).toBe(fallback);
    expect(normalizeGroupContextLimit(false, fallback, min, max)).toBe(fallback);
  });

  it("有效性判据只接受范围内的整数（决定保存按钮可用性）", () => {
    expect(isGroupContextLimitValid(3, min, max)).toBe(true);
    expect(isGroupContextLimitValid(50, min, max)).toBe(true);
    expect(isGroupContextLimitValid(2, min, max)).toBe(false);
    expect(isGroupContextLimitValid(51, min, max)).toBe(false);
    expect(isGroupContextLimitValid(10.5, min, max)).toBe(false);
    expect(isGroupContextLimitValid("10", min, max)).toBe(true);
    expect(isGroupContextLimitValid("", min, max)).toBe(false);
    expect(isGroupContextLimitValid(Number.NaN, min, max)).toBe(false);
    expect(isGroupContextLimitValid(null, min, max)).toBe(false);
    expect(isGroupContextLimitValid(false, min, max)).toBe(false);
  });
});

describe("记忆管理台规则 · 失败清单与区块成员展示", () => {
  it("失败清单拼成逐行文本，空清单返回空串", () => {
    expect(describeDeleteAllFailure([])).toBe("");
    expect(describeDeleteAllFailure([{ path: "a.json", error: "EBUSY" }])).toBe("a.json（EBUSY）");
    expect(describeDeleteAllFailure([
      { path: "a.json", error: "EBUSY" },
      { path: "b.json", error: "EPERM" },
    ])).toBe("a.json（EBUSY）\nb.json（EPERM）");
  });

  it("成员标签：外部带渠道/类型/名字，桌面用会话 id", () => {
    expect(zoneMemberLabel({ kind: "external", channel: "qq", chatId: "123", chatType: "group", senderName: "某群" }))
      .toBe("qq · group · 某群");
    expect(zoneMemberLabel({ kind: "external", channel: "qq", chatId: "123", chatType: "group" }))
      .toBe("qq · group · 123");
    expect(zoneMemberLabel({ kind: "external", channel: "wechat", chatId: "wx", chatType: "private" }))
      .toBe("wechat · private · wx");
    expect(zoneMemberLabel({ kind: "desktop", conversationId: "conv-1" })).toBe("conv-1");
  });

  it("成员唯一性键：桌面与外部两套命名空间不互相碰撞", () => {
    expect(zoneMemberKey({ kind: "desktop", conversationId: "x" })).toBe("desktop:x");
    expect(zoneMemberKey({ kind: "external", sessionId: "x" })).toBe("external:x");
    expect(zoneMemberKey({ kind: "desktop", conversationId: "x" }))
      .not.toBe(zoneMemberKey({ kind: "external", sessionId: "x" }));
  });
});

/**
 * 镜像值漂移守卫（F18 教训：**"被引用 = 0"的核查只查 import 图是不够的**，
 * 以"路径字符串引用"读源文件也是一种依赖，且 tsc 看不见）。
 *
 * 这三个常量在渲染侧是**镜像**的（渲染进程不能 import 主进程模块）→ 主进程一改，
 * 渲染侧就静默漂移。这里直接读主进程源文件逐字比对，把漂移变成一条红测试。
 */
describe("记忆管理台规则 · 与主进程的镜像值漂移守卫", () => {
  const mainSettingsPath = resolve(__dirname, "../../../../../main/settings/general-settings.ts");
  const source = readFileSync(mainSettingsPath, "utf8");

  function readMainConstant(name: string): number {
    const match = new RegExp(`export const ${name}\\s*=\\s*(\\d+)\\s*;`).exec(source);
    if (!match) throw new Error(`主进程源文件里找不到 ${name}（路径或写法变了？）: ${mainSettingsPath}`);
    return Number(match[1]);
  }

  it("DEFAULT / MIN / MAX 三个数与 src/main/settings/general-settings.ts 逐字一致", () => {
    expect(DEFAULT_GROUP_CONTEXT_LIMIT).toBe(readMainConstant("DEFAULT_GROUP_CONTEXT_LIMIT"));
    expect(MIN_GROUP_CONTEXT_LIMIT).toBe(readMainConstant("MIN_GROUP_CONTEXT_LIMIT"));
    expect(MAX_GROUP_CONTEXT_LIMIT).toBe(readMainConstant("MAX_GROUP_CONTEXT_LIMIT"));
  });

  it("主进程确实导出 normalizeGroupContextLimit（镜像语义的权威来源）", () => {
    expect(source).toMatch(/export function normalizeGroupContextLimit\s*\(/);
  });
});
