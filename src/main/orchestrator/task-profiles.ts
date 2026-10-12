import type { TaskAccessMode, TaskSubagentType } from "../../shared/task-session";
import type { ToolDefinition } from "./tools/registry/tool-registry";

/** 子任务永远不能再委托、直接等待用户或替父任务确认危险副作用。 */
const CHILD_BLOCKED_TOOL_IDS = new Set([
  "task",
  "close_task",
  "ask_user",
  "ask_user_choice",
  "confirm_uncertain_effect",
]);

export interface TaskAgentProfile {
  id: TaskSubagentType;
  name: string;
  description: string;
  allowedToolIds: "inherit" | readonly string[];
  timeoutMs: number;
}

const profiles: Record<TaskSubagentType, TaskAgentProfile> = {
  general: {
    id: "general",
    name: "通用子任务",
    description: "独立完成多步调查、文件操作或实现工作。",
    allowedToolIds: "inherit",
    timeoutMs: 0,
  },
  document: {
    id: "document",
    name: "文档子任务",
    description: "生成并核验文档或工作文件。",
    allowedToolIds: [
      "write_word",
      "write_excel",
      "write_pdf",
      "Write",
      "Read",
      "Glob",
    ],
    timeoutMs: 0,
  },
  search: {
    id: "search",
    name: "搜索子任务",
    description: "搜索、阅读并整理带来源的事实。",
    allowedToolIds: ["web_search", "fetch_url"],
    timeoutMs: 0,
  },
};

export function getTaskAgentProfile(type: TaskSubagentType): TaskAgentProfile {
  return profiles[type];
}

/** 只能缩小父工具集，绝不通过 profile 给子任务凭空增加工具。 */
export function resolveTaskTools(
  profile: TaskAgentProfile,
  parentTools: ToolDefinition[],
  accessMode: TaskAccessMode = "write",
): ToolDefinition[] {
  const allowed = profile.allowedToolIds === "inherit" ? null : new Set(profile.allowedToolIds);
  return parentTools.filter((tool) => {
    if (tool.browserControlPhase || CHILD_BLOCKED_TOOL_IDS.has(tool.id) || (allowed !== null && !allowed.has(tool.id))) return false;
    if (accessMode !== "read_only") return true;
    // 动态副作用分类在模型提供真实参数前无法证明只读，保守地不暴露给只读子任务。
    return tool.effectKind === "read" && tool.effectResolver === undefined;
  });
}
