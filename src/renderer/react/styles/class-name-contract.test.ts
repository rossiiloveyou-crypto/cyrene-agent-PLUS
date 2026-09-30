// P9.5 新增门禁（判据台账 J-32 固化）：**本任务新写的面板，用到的类必须都有定义**。
//
// ── 为什么需要它 ──────────────────────────────────────────────
// H-19 那个缺陷：P9 的三个新面板**没有专属 CSS、也没 import 任何 CSS**，
// 用到的 5 个**容器类**（`cy-memory-manager__detail` / `__group` / `__trace` / `__preview` /
// `cy-zone-card`）在**全仓 56 个 CSS 里一个都没定义** → 面板渲染成一堆裸 div：
// 文字互相重叠、卡片没有边界、按钮漂在行外。而 `tsc` / `vitest` **全绿**。
// 静态门禁对这一类失效**结构上完全失明** —— 只有人眼看得出来。所以必须固化成机器判据，
// 否则下一个新面板会重蹈同一个坑（P9.5 蓝图 §十 2）。
//
// ── 判据为什么只覆盖"新面板" ─────────────────────────────────
// 全量扫描（`src/renderer/react/**` 的**全部** `.tsx`）实测会命中官方组件的
// **22 处"类名无定义"**。逐条核实后，它们与 H-19 **不是同一类**：
//   · `cy-page-windows`（AppearanceSettingsPage:242）—— 版面由**兄弟类** `cy-settings-titlebar` 提供，
//     自身没有任何规则，是无害的语义钩子；
//   · `cy-winbtn--minimize` / `--maximize`（WindowControls）—— BEM modifier，样式统一挂在基类
//     `.cy-winbtn` 上，modifier 只是语义标记；
//   · `cy-settings-nav-item` / `cy-model-selector` / `cy-sidebar-sortable-session` … —— 同类。
// 它们**不是"忘了抄样式"**，而是"类名从未打算被样式化"。
//
// 🔴 而 H-19 的特征是：**一整个面板的容器类全无定义** → 布局塌成裸 div。
//    因此本门禁的判据形状 = **"本任务新增/重写的面板，其类名必须 100% 有定义"**，
//    既不放过 H-19 那一类，也不把官方既有组件的 22 处历史欠账混进来
//    （改它们会越界 —— P9.5 C1 / N2 明令不许动官方既有面板）。
//
// 那 22 处的处置：**登记为欠账，不在本 Phase 修**（见 P9.5 完成报告 §五 与本文件末尾清单）。
// 它们不产生可见缺陷（已逐条核实规则落点），但若将来有人给其中一个补了规则，
// 应当把它从"历史欠账"降级为"正式类名"并纳入本门禁的全量口径。
//
// ⚠️ 动态类名取不到就跳过（`className={someVar}`）—— 宁可漏报不造假阳性。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findClassNameUsages, findDefinedClassNames, describeUsage } from "./class-name-scanner";

/** `src/renderer/react/`（本文件在 `react/styles/` 下，故上溯两层）。 */
const reactRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * 本门禁覆盖的面：P9 / P9.5 **新增或重写**的面板。
 * 新增面板时把路径加进来 —— 这是本门禁唯一的维护点。
 */
const COVERED_TSX = [
  "features/settings/memory-console/MemoryManagerSection.tsx",
  "features/settings/memory-console/DangerZoneSection.tsx",
  "features/settings/ZonesSettingsPanel.tsx",
];

/**
 * 全量口径实测的**历史欠账**（22 处，官方既有组件，本 Phase 不修）。
 * 只用于在"全量扫描"那条诊断用例里把噪音与真缺陷分开报告。
 */
const KNOWN_LEGACY_UNDEFINED = new Set([
  "cy-user-avatar__trigger",
  "cy-winbtn--minimize",
  "cy-winbtn--maximize",
  "api-config__editor-head",
  "cy-run-activity__expanded",
  "cy-harness-recovery",
  "cy-sidebar-sortable-session",
  "cy-sidebar-project__category-action",
  "cy-sidebar-project--unbound",
  "cy-sidebar-name-modal",
  "is-expandable",
  "cy-model-selector",
  "plugin-panel__market-toggle-label",
  "moment-card__comment-colon",
  "cy-scheduled-interval",
  "cy-settings-nav-item",
  "cy-page-windows",
  "cy-model-runtime",
  "cy-model-runtime__parallel",
  "cy-settings-tools__permission",
  "plugin-panels",
]);

function filesWithExtension(dir: string, pattern: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesWithExtension(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

/** 全仓 `src/renderer/react/**` 下所有 CSS 定义过的类名。 */
function allDefinedClassNames(): Set<string> {
  const defined = new Set<string>();
  for (const file of filesWithExtension(reactRoot, /\.css$/)) {
    for (const name of findDefinedClassNames(fs.readFileSync(file, "utf8"))) defined.add(name);
  }
  return defined;
}

describe("React 类名契约（新面板的类必须有定义）", () => {
  it("扫描器自身：能取静态类名、跳过动态表达式与插值残片、放行库前缀", () => {
    const sample = [
      '<div className="cy-a cy-b" />',
      "<div className={`cy-c ${dynamic} cy-d`} />",
      "<div className={`x is-${state}`} />",
      '<div className={flag ? "cy-e" : "cy-f"} />',
      '<div className={someObject} />',
      '<div className="ant-btn radix-x cy-g" />',
    ].join("\n");
    const found = findClassNameUsages("sample.tsx", sample);
    expect([...found.keys()].sort()).toEqual(["cy-a", "cy-b", "cy-c", "cy-d", "cy-e", "cy-f", "cy-g", "x"]);
    // 插值残片 `is-` 与库前缀都不进结果
    expect(found.has("is-")).toBe(false);
    expect(found.has("ant-btn")).toBe(false);
    expect(found.has("radix-x")).toBe(false);
  });

  it("从 CSS 抽取已定义类名：必须全名相等（`.a` 不得由 `.a__b` 假命中）", () => {
    const defined = findDefinedClassNames([
      "/* .cy-comment-only 是注释，不算定义 */",
      ".cy-a { color: red; }",
      ".cy-b:hover, .cy-c.is-active { color: blue; }",
      ".cy-d .cy-e { color: green; }",
    ].join("\n"));
    expect(defined.has("cy-a")).toBe(true);
    expect(defined.has("cy-b")).toBe(true);
    expect(defined.has("cy-c")).toBe(true);
    expect(defined.has("cy-e")).toBe(true);
    expect(defined.has("cy-comment-only")).toBe(false);

    // 🔴 这条钉住 P9.5 实测过的假阴性：`_` 属于 `\w`，用 `\b` 会让 `.cy-model-selector`
    //    错误地命中 `.cy-model-selector__item` 的定义
    const nested = findDefinedClassNames(".cy-model-selector__item { color: red; }");
    expect(nested.has("cy-model-selector")).toBe(false);
    expect(nested.has("cy-model-selector__item")).toBe(true);
  });

  it("🔴 新面板用到的每一个类都必须有定义（这是 H-19 的回归网）", () => {
    const defined = allDefinedClassNames();
    const missing: string[] = [];
    for (const relative of COVERED_TSX) {
      const file = path.join(reactRoot, relative);
      const usages = findClassNameUsages(relative, fs.readFileSync(file, "utf8"));
      for (const [name, line] of usages) {
        if (!defined.has(name)) missing.push(`${describeUsage(relative, line)} → .${name}`);
      }
    }
    expect(missing, `以下类名在新面板里被使用，但全仓没有任何 CSS 定义它：\n${missing.join("\n")}`).toEqual([]);
  });

  it("全量口径只用于**诊断**：官方既有组件的未定义类名不得出现新增项", () => {
    const defined = allDefinedClassNames();
    const unexpected: string[] = [];
    for (const file of filesWithExtension(reactRoot, /\.tsx$/).filter((f) => !/\.(?:test|spec)\.tsx$/.test(f))) {
      const usages = findClassNameUsages(path.relative(reactRoot, file), fs.readFileSync(file, "utf8"));
      for (const [name, line] of usages) {
        if (defined.has(name) || KNOWN_LEGACY_UNDEFINED.has(name)) continue;
        unexpected.push(`${describeUsage(path.relative(reactRoot, file), line)} → .${name}`);
      }
    }
    // 这个用例的作用：**冻结**已知欠账。将来新增的未定义类名会在这里报红，
    // 而修好某一处历史欠账后，把它从 KNOWN_LEGACY_UNDEFINED 里删掉即可（应当收紧）。
    expect(unexpected, `出现了「历史欠账清单」之外的未定义类名：\n${unexpected.join("\n")}`).toEqual([]);
  });
});
