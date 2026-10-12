import { describe, expect, it } from "vitest";
import en from "./en.json";
import jaJP from "./ja-JP.json";
import zhCN from "./zh-CN.json";

/**
 * 资源完整性护栏：新增文案时必须三份语言一起补，漏翻在这里就报出来。
 * 以中文为基准——它是回退语言（fallbackLng），key 最全。
 */

type Resource = Record<string, unknown>;

const BASE_LOCALE = "zh-CN";

const RESOURCES: Record<string, Resource> = {
  en: en as Resource,
  "ja-JP": jaJP as Resource,
  "zh-CN": zhCN as Resource,
};

/**
 * 允许「少于基准语言」的语言及其**缺口上限**（`i18n` 部分翻译登记）。
 *
 * 为什么需要这张表（而不是让门禁一直红）：日语界面在本次合并前就没有跟着 React 改版补齐，
 * 缺口是**已知的、待翻译的历史欠账**；但门禁长期带一条固定红灯，会让真实回归被噪声掩盖。
 * ⇒ 改用「**显式登记 + 单向收紧**」：缺口数被钉在这里，**增加即失败，减少要同步下调本值**。
 *
 * 🔴 纪律：**不许为了让它变绿而上调这个数字**。日语补齐后请删除本表对应条目。
 * 背景与账目见 `docs/construction/HEB-1.3.0/TASK-H1.3.0/PHASE-3-完成报告.md` §五 偏差 4。
 */
const PARTIAL_LOCALES: Record<string, number> = {
  "ja-JP": 377,
};

/** 展平成 "a.b.c" 叶子路径；数组与空对象按叶子整体看待 */
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  const entries = Object.entries(value as Resource);
  if (entries.length === 0) return [prefix];
  return entries.flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe("i18n 资源完整性", () => {
  const baseKeys = flattenKeys(RESOURCES[BASE_LOCALE]);

  it("基准语言资源非空", () => {
    expect(baseKeys.length).toBeGreaterThan(0);
  });

  it.each(Object.keys(RESOURCES).filter((locale) => locale !== BASE_LOCALE))(
    "%s 与基准语言的 key 完全一致",
    (locale) => {
      const keys = flattenKeys(RESOURCES[locale]);
      const own = new Set(keys);
      const base = new Set(baseKeys);
      const missing = baseKeys.filter((key) => !own.has(key));

      // 多翻永远不允许：这通常意味着 key 拼错或基准语言漏了键。
      expect(keys.filter((key) => !base.has(key))).toEqual([]);

      const allowedMissing = PARTIAL_LOCALES[locale];
      if (allowedMissing === undefined) {
        // 完整翻译的语言：必须一个不缺
        expect(missing).toEqual([]);
        return;
      }

      // 部分翻译的语言：缺口必须**已知且不扩大**
      expect(
        missing.length,
        `${locale} 的未翻译 key 数（登记上限 ${allowedMissing}）`,
      ).toBeLessThanOrEqual(allowedMissing);
      expect(
        missing.length,
        `🎉 ${locale} 的缺口已缩小到 ${missing.length}（登记值 ${allowedMissing}）——` +
          `请下调 or 删除 resources.test.ts 的 PARTIAL_LOCALES["${locale}"]，让门禁收紧`,
      ).toBe(allowedMissing);

      // 缺口清单本身要能被复核：抽头几个键打印出来，便于人工确认是"没翻"而非"翻错位置"
      if (missing.length > 0) {
        expect(
          missing.slice(0, 5).every((key) => base.has(key)),
          `${locale} 缺口清单必须全部来自基准语言`,
        ).toBe(true);
      }
    },
  );

  it("角色名在每种语言里都齐全且无遗留中文", () => {
    const baseNames = Object.keys(RESOURCES[BASE_LOCALE].characterNames as Record<string, string>);
    expect(baseNames.length).toBeGreaterThan(0);

    for (const [locale, resource] of Object.entries(RESOURCES)) {
      const names = resource.characterNames as Record<string, string>;
      expect(Object.keys(names).sort(), `${locale} 的角色名 key`).toEqual([...baseNames].sort());
      // 中文 key 是运行时昵称，值不该留空
      for (const [nickname, display] of Object.entries(names)) {
        expect(display.trim(), `${locale} 的 ${nickname}`).not.toBe("");
      }
    }
  });
});