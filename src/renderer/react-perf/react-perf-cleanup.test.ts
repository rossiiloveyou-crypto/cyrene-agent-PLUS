// @ts-nocheck -- renderer tsconfig intentionally omits Node test globals.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(__dirname, "../../..");
const perfMain = resolve(__dirname, "main.tsx");
const baselineScript = resolve(projectRoot, "scripts/perf/chat-renderer-baseline.mjs");
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const spikeFiles = [
  "streamdown-spike.tsx",
  "streamdown-spike.css",
  "streamdown-spike.test.ts",
  "streamdown-spike-state.test.ts",
];

describe("react perf harness cleanup", () => {
  it("uses the production renderer without an injected Streamdown experiment", () => {
    expect(readFileSync(perfMain, "utf8")).not.toContain("__cyreneChatPerfMarkdownRenderer");
    expect(readFileSync(baselineScript, "utf8")).not.toContain("paired-control");
    for (const file of spikeFiles) {
      expect(existsSync(resolve(__dirname, file))).toBe(false);
    }
  });

  it("declares Streamdown as a renderer build dependency without the retired renderer", () => {
    // Vite bundles renderer imports into dist/renderer; Electron only packages
    // production dependencies for the main process.
    expect(packageJson.devDependencies?.streamdown).toBeDefined();
    expect(packageJson.devDependencies?.["@streamdown/math"]).toBeDefined();
    expect(packageJson.devDependencies?.katex).toBeDefined();
    expect(packageJson.dependencies?.streamdown).toBeUndefined();
    expect(packageJson.dependencies?.["@streamdown/math"]).toBeUndefined();
    expect(packageJson.dependencies?.katex).toBeUndefined();
    expect(packageJson.dependencies?.["@ant-design/x-markdown"]).toBeUndefined();
  });
});
