import { app } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  normalizeChatMessagesWithTime,
  type ChatContextMessage,
} from "./chat-time-context";

export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

export function normalizeChatMessages(input: unknown): ChatContextMessage[] {
  return normalizeChatMessagesWithTime(input);
}

export function getApiLogPath(): string {
  return path.join(app.getPath("userData"), "chat-api.log");
}

/**
 * 整份销毁 API 调试日志（P3 擦除某人）。
 *
 * 这一份文件不是"某个人的记忆"，而是**每次模型调用的完整 prompt 正文 + raw/cleaned response**
 * —— 它比 transcript 还全（含被注入的记忆）。逐块过滤不可靠（它是 `====` 分隔的非结构化文本，
 * 正文里可能只是转述），所以唯一可靠解就是整份删。
 * `getApiLogPath()` 全仓无读取方（只写不读），删除零功能影响；文件不存在时返回
 * `{ deleted: false, bytes: 0 }` 且**绝不抛错**。
 */
export function eraseApiLog(): { deleted: boolean; bytes: number } {
  const target = getApiLogPath();
  try {
    if (!fs.existsSync(target)) return { deleted: false, bytes: 0 };
    const bytes = fs.statSync(target).size;
    try {
      fs.rmSync(target, { force: true });
      return { deleted: true, bytes };
    } catch {
      // 删除失败（如文件被占用）：如实回报字节数，别谎报 0
      return { deleted: false, bytes };
    }
  } catch {
    return { deleted: false, bytes: 0 };
  }
}

export function appendApiLog(
  label: string,
  requestMessages: Array<{ role: string; content: string }>,
  rawResponse: string,
  cleanedResponse: string,
): void {
  try {
    const now = new Date().toISOString();
    const entry = [
      "=".repeat(80),
      `[${now}] ${label}`,
      "-".repeat(40) + " REQUEST " + "-".repeat(40),
      JSON.stringify(requestMessages, null, 2),
      "-".repeat(40) + " RAW RESPONSE " + "-".repeat(40),
      rawResponse,
      "-".repeat(40) + " CLEANED " + "-".repeat(40),
      cleanedResponse || "(empty)",
      "=".repeat(80),
      "",
    ].join(os.EOL);
    fs.appendFileSync(getApiLogPath(), entry, "utf8");
  } catch {
    // silent
  }
}
