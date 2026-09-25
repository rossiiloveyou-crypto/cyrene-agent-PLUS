import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 设置窗口 DOM 引用一致性守卫。
 *
 * 背景：面板搬迁（如「API 设置」整体迁到聊天窗口）时，若只删 HTML 里的元素而留下
 * `dom.ts` 的 `getElementById` 引用，模块顶层就会对 `null` 调 `addEventListener`，
 * 抛出 TypeError 并中断整个 settings 入口模块 —— 表现为「设置页所有按钮都点不动、连
 * 关闭按钮都失效」。这类故障没有类型错误、也不一定有测试覆盖，所以在这里加一道静态守卫。
 */

const settingsDir = fileURLToPath(new URL(".", import.meta.url));
const html = readFileSync(path.join(settingsDir, "index.html"), "utf8");
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx") ? [full] : [];
  });
}

const sourceFiles = walk(settingsDir).map((file) => ({
  file,
  relative: path.relative(settingsDir, file).replace(/\\/g, "/"),
  source: readFileSync(file, "utf8"),
}));

interface DomRef {
  identifier: string;
  elementId: string;
  file: string;
}

/** 收集所有 `export const X = document.getElementById("id")` 形式的引用。 */
const domRefs: DomRef[] = [];
for (const { relative, source } of sourceFiles) {
  if (!relative.endsWith("dom.ts")) continue;
  for (const match of source.matchAll(/export const (\w+)\s*=\s*document\.getElementById\(\s*"([^"]+)"\s*\)/g)) {
    domRefs.push({ identifier: match[1], elementId: match[2], file: relative });
  }
}

/** 该标识符在某个源文件里是否存在「无保护」的使用（属性访问 / 顶层 addEventListener）。 */
function unguardedUse(identifier: string, source: string): boolean {
  // 形如 `x?.foo` 或 `if (!x)` 保护的情况：这里只拦截确定会抛错的形态
  const directAddEventListener = new RegExp(`(^|[^\\w?.])${identifier}\\.addEventListener\\(`, "m");
  return directAddEventListener.test(source);
}

describe("设置窗口 dom.ts 引用与 index.html 一致", () => {
  it("至少解析到一批 DOM 引用（守卫本身有效）", () => {
    expect(domRefs.length).toBeGreaterThan(100);
  });

  it("每个 dom.ts 引用的元素 id 都存在于 index.html", () => {
    const missing = domRefs.filter((ref) => !htmlIds.has(ref.elementId));
    expect(
      missing.map((ref) => `${ref.file}: ${ref.identifier} -> #${ref.elementId}`),
      "这些元素在 index.html 里已不存在；若面板已迁移，请一并删除 dom.ts 引用（否则设置页初始化会整页崩溃）",
    ).toEqual([]);
  });

  it("不存在对可能缺失元素的无保护 addEventListener 调用", () => {
    const offenders: string[] = [];
    for (const ref of domRefs) {
      if (htmlIds.has(ref.elementId)) continue;
      for (const candidate of sourceFiles) {
        if (unguardedUse(ref.identifier, candidate.source)) {
          offenders.push(`${candidate.relative}: ${ref.identifier}.addEventListener (元素 #${ref.elementId} 不存在)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
