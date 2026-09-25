// 工具 JSON Schema 结构哨兵（structural guard）。
//
// 背景（2026-09-21 真实线上故障）：install_mcp_server 的 args 写成
// { type: "array" } 却漏了 items。Google 系（Gemini）对 function declaration
// 做严格 JSON Schema 校验，会整包拒绝并返回：
//   400 INVALID_ARGUMENT ... function_declarations[18].properties[args].items: missing field.
// 由于工具清单是整包下发的，一处缺失 = 该模型所有请求全灭，且错误在 UI 上只表现为
// 笼统的 E_HARNESS_FAILURE，极难定位。
//
// 口径来源：以下规则用真实端点 A/B 实测过（[B]gemini-2.5-pro @ api.ricardochat.xyz）：
//   - { type:"array" } 无 items              → 400 INVALID_ARGUMENT（必须拦）
//   - { type:"array", items:{type:"string"} } → 200（修复形态）
//   - { type:"object" } 无 properties         → 200（**合法**，不要误报）
// 只拦已确证会被拒的结构，避免把合法 schema 判成缺陷。
//
// 注意：这里断言的是"零缺陷"，不做自动修补。修补会让同一个 schema 在不同 provider
// 看到不同形状（缓存指纹漂移），缺陷应当在源头被写错的那一刻被拦住。
import { describe, expect, it } from "vitest";
import { toolRegistry } from "./registry/tool-registry";
import "./built-in-tools"; // 触发内置工具注册（与运行时同一侧效应）

/** 已确证会被 Google 严格校验拒绝的结构缺陷描述；空数组 = 合法。 */
export function structuralViolations(toolId: string, schema: unknown): string[] {
  const issues: string[] = [];

  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }

    const record = node as Record<string, unknown>;

    // 唯一已确证的硬性要求：type:"array" 必须有 items。
    // 注意 items 必须是单个 schema；写成数组（tuple 形式）在 Google 侧同样非法。
    if (record.type === "array" && record.items === undefined) {
      issues.push(`${toolId} :: ${path} —— type:"array" 缺少 items`);
    }

    for (const [key, value] of Object.entries(record)) {
      // description/default/enum 等叶子字段不需要继续下钻
      if (key === "description" || key === "default" || key === "enum") continue;
      walk(value, `${path}.${key}`);
    }
  };

  walk(schema, "inputSchema");
  return issues;
}

describe("工具 JSON Schema 结构哨兵", () => {
  const tools = toolRegistry.getAllTools();

  it("注册表非空（防止本哨兵因注册缺失而空转通过）", () => {
    expect(tools.length).toBeGreaterThan(10);
  });

  it("没有任何工具声明 array 缺 items", () => {
    const allIssues: string[] = [];
    for (const tool of tools) {
      allIssues.push(...structuralViolations(tool.id, tool.inputSchema));
    }
    // 失败时一眼看到是哪个工具的哪个字段：Google 只会报"第一个"错误，这里报全部
    expect(allIssues, allIssues.join("\n")).toEqual([]);
  });

  it("哨兵本身有效：能识别缺 items 的 schema（防空转）", () => {
    const buggy = {
      type: "object",
      properties: {
        ok: { type: "string" },
        args: { type: "array", description: "故意缺 items" },
      },
      required: ["ok"],
    };
    expect(structuralViolations("fake_tool", buggy)).toEqual([
      'fake_tool :: inputSchema.properties.args —— type:"array" 缺少 items',
    ]);
    // 嵌套在 items 里的 array 同样要能抓到（Google 校验整棵树）
    const nested = {
      type: "object",
      properties: { list: { type: "array", items: { type: "array" } } },
    };
    expect(structuralViolations("fake_tool", nested)).toEqual([
      'fake_tool :: inputSchema.properties.list.items —— type:"array" 缺少 items',
    ]);
    // object 无 properties 是 Google 允许的，不得误报
    expect(structuralViolations("fake_tool", { type: "object", properties: { env: { type: "object" } } })).toEqual([]);
  });

  it("install_mcp_server.args 显式带 items（本次故障的回归锚点）", () => {
    const tool = toolRegistry.getById("install_mcp_server");
    expect(tool, "install_mcp_server 应已注册").toBeDefined();
    const args = tool!.inputSchema.properties.args as { type?: string; items?: unknown };
    expect(args.type).toBe("array");
    expect(args.items).toEqual({ type: "string" });
  });
});
