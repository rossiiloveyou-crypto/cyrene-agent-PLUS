import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 🔴 P8 修订（H-07 执行）：本守卫原先**硬编码**下面 8 个 `panel.ts` 路径并直接 `readFileSync`。
 * H-07（PHASE-8 §四 4.3）按「被引用 = 0」删除了其中的 **2 个空壳**：
 * `memory/panel.ts` 与 `preferences/panel.ts` → 硬读会 `ENOENT`，把整条守卫判红
 * （实测：`E:\…\src\renderer\settings\memory\panel.ts`）。
 *
 * 处置：**守卫保留**（它护着其余 6 个 panel 的"不得回退到默认弹窗"约束），
 * 但改为**存在性过滤** —— 路径被删除即自然跳过，若 P9 重建该 panel 则自动重新纳入检查。
 * 这样守卫不会因为「文件被有意删除」而变成假红，也不会悄悄放过未删除的文件。
 */
const settingsRoot = fileURLToPath(new URL(".", import.meta.url));
const files = [
  "mcp/panel.ts", "scheduler/panel.ts", "tokens/panel.ts",
  "channels/panel.ts", "memory/panel.ts", "preferences/panel.ts",
  "tts/panel.ts", "rag/panel.ts",
];

describe("settings feedback migration", () => {
  it("contains no default dialogs or legacy showModal calls", () => {
    const offenders = files.filter((file) => {
      const absolute = path.join(settingsRoot, file);
      // H-07：被有意删除的空壳不再读；仍在磁盘上的必须继续通过检查
      if (!fs.existsSync(absolute)) return false;
      const source = fs.readFileSync(absolute, "utf8");
      return /\b(?:window\.)?(?:alert|confirm)\s*\(|\bshowModal\s*\(/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("does not duplicate the shared modal inside RAG", () => {
    const source = fs.readFileSync(path.join(settingsRoot, "rag/panel.ts"), "utf8");
    expect(source).not.toContain("function _showModal");
    expect(source).not.toContain('id = "cy-modal-overlay"');
  });
});
