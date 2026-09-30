// 「新面板用到的类必须都有定义」扫描器（P9.5 · 判据台账 J-32 的可复用内核）。
//
// 为什么需要它：P9 的三个新面板**没有任何专属 CSS、也没 import 任何 CSS**，
// 用到的 5 个容器类在**全仓 56 个 CSS 里一个都没定义** → 面板渲染成一堆裸 div
// （文字互相重叠、卡片没有边界、按钮漂在行外）。而 `tsc` / `vitest` **全绿** ——
// 静态门禁对这一类失效**结构上完全失明**，只有人眼看得出来。
//
// 用 TypeScript 语法树而不是正则（照 `default-dialogs-scanner.ts` 的做法）：
//   · 正则会把 `className={\`a ${b} c\`}` 的表达式片段当成类名（P9.5 期间实测的假阳性）
//   · 正则抓不到 `className={cond ? "a" : "b"}` 里的字符串字面量
//
// 🔴 **只扫"以类名开头"的字面量**（`^[A-Za-z][\w-]*$`）。理由：本仓的类名是
//    kebab/BEM 手工命名，而 antd / radix 等库的类名以 `ant-` / `radix-` 开头 ——
//    它们由库自己带 CSS，不应要求本仓定义。这条约定把"库类名"和"自家类名"分开，
//    是本扫描器**唯一**的假设；若将来出现自家 `ant-` 前缀类名，需在此显式放行。

import path from "node:path";
import ts from "typescript";

/** 以类名形态出现的字符串（用于 `className="a b"` 与模板字面量的静态片段）。 */
const CLASS_TOKEN = /^[A-Za-z][\w-]*$/;

/** 库自带的类名前缀：不要求本仓有定义。 */
const VENDOR_PREFIXES = ["ant-", "radix-", "rc-"];

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function pushTokens(raw: string, out: Set<string>): void {
  for (const token of raw.split(/\s+/)) {
    if (!token || !CLASS_TOKEN.test(token)) continue;
    if (isInterpolationFragment(token)) continue;
    if (VENDOR_PREFIXES.some((prefix) => token.startsWith(prefix))) continue;
    out.add(token);
  }
}

/**
 * 取一个 `className` 属性值里**静态可知**的类名。
 *
 * 覆盖三种写法：`className="a b"`、`className={\`a ${x} b\`}`（只取静态片段）、
 * `className={cond ? "a" : "b"}`（递归取各分支）。变量与函数调用的结果**取不到就跳过**
 * —— 扫描器宁可漏报一个动态类名，也不要造出假阳性把门禁变成噪音。
 */
function collectFromExpression(node: ts.Expression, out: Set<string>): void {
  if (ts.isStringLiteralLike(node)) { pushTokens(node.text, out); return; }
  if (ts.isTemplateExpression(node)) {
    pushTokens(node.head.text, out);
    for (const span of node.templateSpans) pushTokens(span.literal.text, out);
    return;
  }
  if (ts.isConditionalExpression(node)) {
    collectFromExpression(node.whenTrue, out);
    collectFromExpression(node.whenFalse, out);
    return;
  }
  if (ts.isParenthesizedExpression(node)) { collectFromExpression(node.expression, out); return; }
  if (ts.isBinaryExpression(node)) {
    // `"a b" + (x ? "c" : "d")` 这类拼接：两侧都试
    collectFromExpression(node.left, out);
    collectFromExpression(node.right, out);
  }
}

/**
 * 模板字面量插值留下的**残片**，不是类名。
 *
 * 实测（P9.5）：`className={\`x is-${state}\`}` 会切出 `is-`、`` `cy-run-stage--${k}` `` 会切出
 * `cy-run-stage--` —— 全仓有 236 处 `.is-*` 的 modifier，`is-` 这个残片**本就不该要求定义**。
 * 判据：以 `-` 结尾的片段一律丢弃（真实类名不会以连字符结尾；BEM modifier 的空值分支
 * 应当写成 `is-\${x || ""}` 由插值兜住，而不是让它变成一个独立类名）。
 */
function isInterpolationFragment(token: string): boolean {
  return token.endsWith("-");
}

/**
 * 扫一个源文件里用到的**自家**类名（只取 `className` 属性；`class=` 在 React 里不用）。
 *
 * @returns 类名 → 首次出现的行号（1-based），便于门禁报"哪个文件哪一行用了未定义的类"。
 */
export function findClassNameUsages(file: string, source: string): Map<string, number> {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const found = new Map<string, number>();
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === "className" && node.initializer) {
      const names = new Set<string>();
      if (ts.isStringLiteral(node.initializer)) pushTokens(node.initializer.text, names);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        collectFromExpression(node.initializer.expression, names);
      }
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      for (const name of names) if (!found.has(name)) found.set(name, line);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/** 从 CSS 文本里抽取**已定义**的类名。 */
export function findDefinedClassNames(css: string): Set<string> {
  const defined = new Set<string>();
  // 去掉注释，避免注释里提到的 `.foo` 被当成定义
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // 🔴 必须**全名相等**：`.cy-model-selector` ≠ `.cy-model-selector__item`。
  //   用 `(?![\w-])` 而不是 `\b` —— `_` 在 `\w` 里，`\b` 会在 `__` 之前成立，
  //   于是 `.cy-model-selector` 会假命中 `.cy-model-selector__item`（P9.5 实测的假阴性）。
  for (const match of withoutComments.matchAll(/\.(-?[_a-zA-Z][\w-]*)(?![\w-])/g)) defined.add(match[1]);
  return defined;
}

/** 相对化路径，让失败信息可读（与 `default-dialogs-scanner.ts` 同一口径）。 */
export function describeUsage(file: string, line: number): string {
  return `${path.normalize(file)}:${line}`;
}
