import * as fs from "fs";
import * as path from "path";
import { app, dialog } from "electron";
import { CURRENT_MEMORY_SCHEMA_VERSION } from "./memory-store-defaults";
import { deleteAllMemory } from "./memory-deletion";
import { appendMemoryTrace } from "./memory-trace";

export type MemorySchemaGateResult = "ok" | "migrated" | "aborted";

/** 读取 memory.json 的 schemaVersion；文件不存在返回 null，畸形返回 0（按需要清空处理）。 */
export function readMemorySchemaVersion(userDataDir: string): number | null {
  try {
    const filePath = path.join(userDataDir, "memory.json");
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { schemaVersion?: unknown };
    return typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 0;
  } catch {
    return 0;
  }
}

/** Electron 各版本 showMessageBoxSync 返回 number 或 {response}，统一取 number。 */
function readDialogResponse(result: unknown): number {
  if (typeof result === "number") return result;
  if (result && typeof result === "object" && typeof (result as { response?: unknown }).response === "number") {
    return (result as { response: number }).response;
  }
  return 0;
}

/**
 * 启动期记忆 schema 闸门。**必须在任何 memoryStore.load() / initRAG() 之前调用**。
 *
 * 返回值：
 *   "ok"       —— 无需处理（文件不存在，或已是当前版本）
 *   "migrated" —— 用户确认，已清空旧的记忆文件（调用方随后会按 v3 重建空存储）
 *   "aborted"  —— 用户选择退出应用，调用方应立刻中止启动流程
 *
 * 本函数是**同步阻塞**的（showMessageBoxSync），只在启动期调用一次。
 */
export function runMemorySchemaGate(userDataDir: string = app.getPath("userData")): MemorySchemaGateResult {
  const version = readMemorySchemaVersion(userDataDir);
  if (version === null || version >= CURRENT_MEMORY_SCHEMA_VERSION) return "ok";

  const response = readDialogResponse(
    dialog.showMessageBoxSync({
      type: "warning",
      title: "记忆格式升级",
      message: "昔涟的记忆格式已升级到「区块」版本",
      detail:
        `检测到旧版记忆（v${version}）。升级后，记忆将按「区块」隔离，` +
        "旧记忆无法自动迁移，将被清空。\n\n" +
        "此操作不可撤销（桌面对话记录会保留）。如需保留旧记忆，请选择「退出应用」，"
        + "备份 userData 目录后再启动。",
      buttons: ["清空记忆并继续", "退出应用"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }),
  );

  if (response !== 0) return "aborted";

  const result = deleteAllMemory();
  appendMemoryTrace({
    op: "migration.zoneUpgrade",
    layer: "migration",
    status: result.failed.length === 0 ? "ok" : "error",
    details: { from: version, to: CURRENT_MEMORY_SCHEMA_VERSION, deleted: result.deleted },
  });
  return "migrated";
}
