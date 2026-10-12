// shiki 语法高亮单例：文件预览与 diff 卡片共用。
// 注意：必须用 core + JavaScript 正则引擎（oniguruma-to-es），
// 不能用 "shiki" 主入口的 createHighlighter —— 它默认加载 WASM 引擎，
// 而聊天窗口的 CSP（script-src 'self'，不含 wasm-unsafe-eval）会拒绝
// WebAssembly 编译，导致高亮静默失败、代码永远纯文本。
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages, type BundledLanguage } from "shiki/langs";
import { bundledThemes, type BundledTheme } from "shiki/themes";

const LIGHT_THEME: BundledTheme = "github-light";
const DARK_THEME: BundledTheme = "dark-plus";

/** 文件扩展名 → shiki 语言（文件预览与 diff 卡片共用） */
const EXT_LANG: Record<string, BundledLanguage> = {
  ts: "typescript", tsx: "tsx", mts: "typescript",
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "jsonc",
  css: "css", scss: "scss",
  html: "html", htm: "html",
  md: "markdown", markdown: "markdown",
  py: "python",
  sh: "bash", bash: "bash", zsh: "bash",
  yml: "yaml", yaml: "yaml",
  xml: "xml", svg: "xml",
  toml: "toml", sql: "sql", go: "go", rs: "rust", java: "java",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", cxx: "cpp",
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getSyntaxHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [bundledThemes[LIGHT_THEME], bundledThemes[DARK_THEME]],
      langs: [...new Set(Object.values(EXT_LANG))].map((lang) => bundledLanguages[lang]),
      // forgiving：个别 TextMate 语法含 oniguruma 特有回溯，容错跳过而不是整体抛错
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return highlighterPromise;
}

export function syntaxLanguageForFile(filePath: string): BundledLanguage | undefined {
  const name = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return EXT_LANG[name.slice(dot + 1).toLowerCase()];
}

export function syntaxThemeForUi(theme: string): BundledTheme {
  return theme === "charcoal-pink" ? DARK_THEME : LIGHT_THEME;
}
