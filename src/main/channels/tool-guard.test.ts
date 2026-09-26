import { describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "../orchestrator/tools/registry/tool-registry";
import type { ChannelAccessEntry, ChannelToolAccessConfig } from "./tool-access";
import type { ChannelAuditInput, ChannelAuditEntry } from "./audit-log";
import { applyChannelToolGuard } from "./tool-guard";

function makeTool(id: string, execute: ToolDefinition["execute"]): ToolDefinition {
  return {
    id,
    name: `工具 ${id}`,
    description: "测试工具",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    effectKind: "read_only",
    execute,
  };
}

function entry(userId: string, tool: boolean): ChannelAccessEntry {
  return { channel: "qq", userId, addedAt: 1, permissions: { private: false, group: true, tool } };
}

const access = (over: Partial<ChannelToolAccessConfig> = {}): ChannelToolAccessConfig => ({
  groupMemberGate: true,
  toolGate: true,
  entries: [],
  ...over,
});

function harness(config: ChannelToolAccessConfig) {
  const audits: ChannelAuditInput[] = [];
  const deps = {
    loadConfig: () => config,
    appendAudit: (input: ChannelAuditInput) => {
      audits.push(input);
      return { ...input, id: "audit-1", at: 1, logPath: "/tmp/audit.log" } as ChannelAuditEntry;
    },
  };
  return { audits, deps };
}

const groupContext = {
  channel: "qq" as const,
  chatType: "group" as const,
  chatId: "2000",
  senderId: "99999",
  senderName: "陌生人",
  sessionId: "session-1",
};

describe("applyChannelToolGuard", () => {
  it("returns an empty list untouched", () => {
    expect(applyChannelToolGuard([], groupContext, harness(access()).deps)).toEqual([]);
  });

  it("blocks a caller without the tool permission, skips execution and audits the block", async () => {
    const execute = vi.fn(async () => "不该被执行");
    const { audits, deps } = harness(access());
    const [guarded] = applyChannelToolGuard([makeTool("shell", execute)], groupContext, deps);

    const output = await guarded.execute({ command: "rm -rf /" }, undefined);

    expect(execute).not.toHaveBeenCalled();
    expect(output.startsWith("[拒绝]")).toBe(true);
    expect(output).toContain("工具 shell");
    expect(output).toContain("99999");
    expect(output).toContain("白名单与权限");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      kind: "tool_call",
      status: "blocked",
      toolId: "shell",
      senderId: "99999",
      senderName: "陌生人",
      chatType: "group",
      chatId: "2000",
      sessionId: "session-1",
      allowlisted: false,
    });
    expect(audits[0].reason).toContain("99999");
    expect(audits[0].args).toEqual({ command: "rm -rf /" });
    // 完整拦截说明写在日志段落里（不再截断到索引）
    expect(audits[0].sections?.[0]?.heading).toBe("拦截说明");
  });

  it("blocks an account that is listed but lacks the tool permission", async () => {
    const execute = vi.fn(async () => "不该被执行");
    const listedContext = { ...groupContext, senderId: "10001" };
    const { audits, deps } = harness(access({ entries: [entry("10001", false)] }));
    const [guarded] = applyChannelToolGuard([makeTool("shell", execute)], listedContext, deps);

    const output = await guarded.execute({}, undefined);

    expect(execute).not.toHaveBeenCalled();
    expect(output).toContain("未授予工具权限");
    expect(audits[0]).toMatchObject({ status: "blocked", allowlisted: false });
  });

  it("executes and audits an account with the tool permission", async () => {
    const execute = vi.fn(async () => "shell output");
    const listedContext = { ...groupContext, senderId: "99999" };
    const { audits, deps } = harness(access({ entries: [entry("99999", true)] }));
    const [guarded] = applyChannelToolGuard([makeTool("shell", execute)], listedContext, deps);

    await expect(guarded.execute({ command: "ls" }, undefined)).resolves.toBe("shell output");

    expect(execute).toHaveBeenCalledWith({ command: "ls" }, undefined);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ kind: "tool_call", status: "success", toolId: "shell", allowlisted: true });
    expect(audits[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(audits[0].sections?.[0]).toEqual({ heading: "工具输出（完整）", body: "shell output" });
  });

  it("keeps auditing when the tool gate is off and marks the call as unchecked", async () => {
    const execute = vi.fn(async () => "ok");
    const { audits, deps } = harness(access({ toolGate: false }));
    const [guarded] = applyChannelToolGuard([makeTool("weather", execute)], groupContext, deps);

    await guarded.execute({}, undefined);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(audits[0].allowlisted).toBeNull();
    expect(audits[0].status).toBe("success");
  });

  it("classifies legacy failure markers as failure", async () => {
    const { audits, deps } = harness(access({ toolGate: false }));
    const [guarded] = applyChannelToolGuard([makeTool("shell", async () => "[错误] 命令失败")], groupContext, deps);

    await guarded.execute({}, undefined);

    expect(audits[0]).toMatchObject({ status: "failure", summary: "[错误] 命令失败" });
  });

  it("rethrows tool errors after auditing them", async () => {
    const { audits, deps } = harness(access({ toolGate: false }));
    const [guarded] = applyChannelToolGuard([
      makeTool("shell", async () => {
        throw new Error("boom");
      }),
    ], groupContext, deps);

    await expect(guarded.execute({}, undefined)).rejects.toThrow("boom");
    expect(audits[0]).toMatchObject({ status: "failure", reason: "boom" });
    expect(audits[0].sections?.some((section) => section.heading === "错误堆栈")).toBe(true);
  });

  it("preserves tool metadata so the model-facing schema is unchanged", () => {
    const tool = makeTool("shell", async () => "ok");
    const [guarded] = applyChannelToolGuard([tool], groupContext, harness(access({ toolGate: false })).deps);

    expect(guarded.id).toBe(tool.id);
    expect(guarded.name).toBe(tool.name);
    expect(guarded.inputSchema).toBe(tool.inputSchema);
    expect(guarded.effectKind).toBe("read_only");
    expect(guarded.execute).not.toBe(tool.execute);
    expect(tool.execute).toBeTypeOf("function");
  });
});
