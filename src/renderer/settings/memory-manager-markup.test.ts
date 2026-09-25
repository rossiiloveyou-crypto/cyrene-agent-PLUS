// @vitest-environment jsdom
//
// 「记忆管理」控制台的 markup / i18n 守卫（P3 §2.17）。
//
// `src/renderer` 没有 tsconfig、`vite build` 也不做类型检查（§0.4 约束 5），
// 所以这一份静态守卫就是这套 UI 的第一道防线：
// - 17 个 DOM id 必须都在 `#memory-panel` 段内（`memory/dom.ts` 的引用在段外取不到）；
// - 批量条 / 详情区默认 is-hidden（两态切换的前提）；
// - 三个删除类按钮默认 disabled（危险动作不能"默认可点"）；
// - 「彻底擦除」绝不能出现在列表里；
// - 代码里用到的 `settings.panel.memory.manager.*` 在 zh-CN 与 en 里都有非空值。

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ⚠️ jsdom 环境下 import.meta.url 不是 file: 协议，所以这里用 __dirname（与 memory/panel.test.ts 一致）
const html = readFileSync(path.resolve(__dirname, "index.html"), "utf8");
const css = readFileSync(path.resolve(__dirname, "settings.css"), "utf8");
const zhCN = JSON.parse(readFileSync(path.resolve(__dirname, "i18n/zh-CN.json"), "utf8")) as Record<string, unknown>;
const en = JSON.parse(readFileSync(path.resolve(__dirname, "i18n/en.json"), "utf8")) as Record<string, unknown>;

/** 取某个 <section id="x"> 的完整片段（与 memory/panel.test.ts 同一写法）。 */
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

const MANAGER_IDS = [
  "memory-manager-view-people",
  "memory-manager-view-zones",
  "memory-manager-view-sessions",
  "memory-manager-refresh-btn",
  "memory-manager-feedback",
  "memory-manager-list",
  "memory-manager-batch-bar",
  "memory-manager-batch-count",
  "memory-manager-batch-delete-btn",
  "memory-manager-detail",
  "memory-manager-detail-title",
  "memory-manager-detail-summary",
  "memory-manager-detail-close-btn",
  "memory-manager-detail-list",
  "memory-manager-detail-delete-btn",
  "memory-manager-erase-btn",
  "memory-manager-trace",
] as const;

const memorySlice = panelSlice("memory-panel");

function injectMemoryPanel(): void {
  document.body.innerHTML = memorySlice;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 不在注入的 #memory-panel 段里`);
  return el as T;
}

function lookup(resource: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (!node || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[part];
  }, resource);
}

describe("「记忆管理」卡片骨架", () => {
  it("17 个 id 全部在 #memory-panel 段内", () => {
    const missing = MANAGER_IDS.filter((id) => !memorySlice.includes(`id="${id}"`));
    expect(missing).toEqual([]);
    // 守卫自身有效：整份 HTML 里也确实是这些 id
    const missingInHtml = MANAGER_IDS.filter((id) => !html.includes(`id="${id}"`));
    expect(missingInHtml).toEqual([]);
  });

  it("卡片排在 L2 卡片之后（顺序锚点）", () => {
    expect(html.indexOf('id="memory-manager-list"')).toBeGreaterThan(html.indexOf('id="memory-l2-list"'));
    expect(html.indexOf('id="memory-l2-list"')).toBeGreaterThan(-1);
  });

  it("dom.ts 用 getElementById 逐个引用了这 17 个 id", () => {
    const dom = readFileSync(path.resolve(__dirname, "memory/dom.ts"), "utf8");
    for (const id of MANAGER_IDS) {
      expect(dom, `memory/dom.ts 缺少 #${id} 的引用`).toContain(`document.getElementById("${id}")`);
    }
  });

  it("批量条与详情区默认隐藏（列表 ↔ 详情两态）", () => {
    injectMemoryPanel();
    expect(byId("memory-manager-batch-bar").classList.contains("is-hidden")).toBe(true);
    expect(byId("memory-manager-detail").classList.contains("is-hidden")).toBe(true);
    expect(byId("memory-manager-trace").classList.contains("is-hidden")).toBe(true);
    // 列表本身默认可见
    expect(byId("memory-manager-list").classList.contains("is-hidden")).toBe(false);
  });

  it("三个视图按钮默认选中「按人」，且是 radiogroup 形态", () => {
    injectMemoryPanel();
    expect(byId("memory-manager-view-people").getAttribute("aria-pressed")).toBe("true");
    expect(byId("memory-manager-view-zones").getAttribute("aria-pressed")).toBe("false");
    expect(byId("memory-manager-view-sessions").getAttribute("aria-pressed")).toBe("false");
    expect(byId("memory-manager-view-people").classList.contains("is-active")).toBe(true);
  });

  it("危险按钮（批量删除 / 详情删除 / 彻底擦除）默认 disabled 且用 ghost-btn--danger", () => {
    injectMemoryPanel();
    for (const id of ["memory-manager-batch-delete-btn", "memory-manager-detail-delete-btn", "memory-manager-erase-btn"]) {
      const btn = byId<HTMLButtonElement>(id);
      expect(btn.disabled, `${id} 默认必须是 disabled`).toBe(true);
      expect(btn.className, `${id} 必须用危险样式`).toContain("ghost-btn--danger");
    }
    // 与「删除全部记忆」同一个类（doc §3.19 明确要求）
    expect(html).toContain('class="ghost-btn ghost-btn--danger" id="memory-delete-all-btn"');
  });

  it("「彻底擦除」只出现在详情区，列表里没有它", () => {
    const listStart = html.indexOf('id="memory-manager-list"');
    const detailStart = html.indexOf('id="memory-manager-detail"');
    expect(listStart).toBeGreaterThan(-1);
    expect(detailStart).toBeGreaterThan(listStart);
    expect(html.slice(listStart, detailStart)).not.toContain("memory-manager-erase-btn");
    injectMemoryPanel();
    expect(byId("memory-manager-detail").contains(byId("memory-manager-erase-btn"))).toBe(true);
    expect(byId("memory-manager-list").contains(byId("memory-manager-erase-btn"))).toBe(false);
  });

  it("有 .memory-manager 的 CSS 规则（否则视图/详情/批量条会裸奔）", () => {
    for (const cls of [".memory-manager__views", ".memory-manager__batch", ".memory-manager__list", ".memory-manager__detail", ".memory-manager__row", ".memory-manager__trace"]) {
      expect(css, `settings.css 缺少 ${cls}`).toContain(cls);
    }
  });
});

describe("控制台用到的 i18n key 在中英文里都存在", () => {
  const sources = ["./memory/manager.ts", "./memory/erasure-flow.ts"]
    .map((file) => readFileSync(path.resolve(__dirname, file), "utf8"))
    .join("\n");
  const keys = new Set(
    [...sources.matchAll(/"(settings\.panel\.memory\.manager\.[A-Za-z0-9_.]+)"/g)].map((match) => match[1]),
  );

  it("确实抓到了 key（守卫自身不能静默失效）", () => {
    expect(keys.size).toBeGreaterThan(50);
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

  it("确认短语两个语言包一致（用户要照着中文输入）", () => {
    expect(lookup(zhCN, "settings.panel.memory.manager.erase.confirmPhrase")).toBe("彻底擦除");
    expect(lookup(en, "settings.panel.memory.manager.erase.confirmPhrase")).toBe("彻底擦除");
  });

  it("静态骨架直接用中文（本窗口 applyTranslations 不生效，§0.4 约束 5）", () => {
    expect(memorySlice).toContain("记忆管理");
    expect(memorySlice).toContain("彻底擦除");
    // 新卡片不依赖 data-i18n（它在这个窗口根本不生效）
    const cardStart = html.indexOf('class="memory-card memory-manager"');
    const cardEnd = html.indexOf("<!-- 群聊上下文");
    expect(cardStart).toBeGreaterThan(-1);
    expect(cardEnd).toBeGreaterThan(cardStart);
    expect(html.slice(cardStart, cardEnd)).not.toContain("data-i18n");
  });
});
