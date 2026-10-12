/**
 * 旧 userData 目录 → 新目录（Cyrene）的一次性数据迁移。
 *
 * 背景：历史上 userData 目录名由 package.json 的 name 字段决定（live2d-cyrene），
 * 开发版与安装版共用。补充 productName 后目录统一为 Cyrene，老用户升级时需要
 * 把旧目录数据搬过来。调用时机必须满足两点：
 *   1. 单实例锁获取成功之后（避免两个实例并发搬运）；
 *   2. 任何读取 userData 的代码之前（首个读取点是 GPU 开关里的 loadGeneralSettings）。
 *
 * 安全策略：只做重命名/复制，绝不主动删除旧目录里有内容的东西；
 * 任一条目失败就留在旧目录，下次启动或用 scripts/migrate-user-data.ps1 重试。
 */

import * as fs from "fs";
import * as path from "path";

/** 历史目录名：package.json 的 name 字段 */
const LEGACY_USER_DATA_DIR_NAME = "live2d-cyrene";

/** 运行时文件：新目录里是刚生成的有效状态，旧目录里的是陈旧垃圾。
 *  迁移时保留新目录版本，删除旧目录版本（进程已退出，必然陈旧）。 */
const RUNTIME_FILE_NAMES = new Set(["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"]);

export interface LegacyUserDataMigrationInput {
  /** app.getPath("appData") —— 旧目录的父目录 */
  appDataPath: string;
  /** app.getPath("userData") —— 迁移目标，即应用当前真正使用的数据目录 */
  targetUserDataPath: string;
}

export type LegacyUserDataMigrationStatus =
  | "skipped" // 目录已是目标（同一路径），无需迁移
  | "none" // 旧目录不存在（新用户），无需迁移
  | "renamed" // 目标不存在，旧目录整体原子重命名
  | "merged" // 两者并存，逐项并入且全部成功
  | "partial" // 逐项并入但有失败，残留留在旧目录
  | "failed"; // 整体重命名失败，本次放弃（应用将以全新目录启动）

export interface LegacyUserDataMigrationResult {
  status: LegacyUserDataMigrationStatus;
}

export function migrateLegacyUserData(
  input: LegacyUserDataMigrationInput,
): LegacyUserDataMigrationResult {
  const legacyPath = path.join(input.appDataPath, LEGACY_USER_DATA_DIR_NAME);
  if (path.resolve(legacyPath) === path.resolve(input.targetUserDataPath)) {
    return { status: "skipped" };
  }
  if (!fs.existsSync(legacyPath)) {
    return { status: "none" };
  }

  // 目标不存在：整体重命名，同卷内原子完成，速度与数据完整性都有保障
  if (!fs.existsSync(input.targetUserDataPath)) {
    try {
      fs.mkdirSync(path.dirname(input.targetUserDataPath), { recursive: true });
      fs.renameSync(legacyPath, input.targetUserDataPath);
      console.log(`[Cyrene] 用户数据目录已整体迁移: ${legacyPath} -> ${input.targetUserDataPath}`);
      return { status: "renamed" };
    } catch (err) {
      console.error("[Cyrene] 用户数据目录整体迁移失败:", err);
      return { status: "failed" };
    }
  }

  // 两者并存（安装版用户常态：新目录里有安装器写入的文件）。
  // 旧目录是真实用户数据，逐项搬入且旧文件优先覆盖目标同名文件。
  let failures = 0;
  for (const entry of fs.readdirSync(legacyPath)) {
    const from = path.join(legacyPath, entry);
    if (RUNTIME_FILE_NAMES.has(entry)) {
      // 陈旧的运行时文件直接丢弃，保住目标目录里刚生成的版本
      try {
        fs.rmSync(from, { recursive: true, force: true });
      } catch {
        // 删不掉也无碍，留在旧目录
      }
      continue;
    }
    const to = path.join(input.targetUserDataPath, entry);
    try {
      fs.rmSync(to, { recursive: true, force: true });
      fs.renameSync(from, to);
    } catch {
      try {
        // rename 失败（文件被占用等）时退化为复制，旧目录原样保留
        fs.cpSync(from, to, { recursive: true, force: true });
      } catch (err) {
        failures += 1;
        console.warn(`[Cyrene] 迁移条目失败，已保留在旧目录: ${entry}`, err);
      }
    }
  }

  // 全部搬空才移除旧目录；有残留说明还有文件被占用，留给下次重试
  try {
    if (fs.readdirSync(legacyPath).length === 0) {
      fs.rmdirSync(legacyPath);
    }
  } catch {
    // 移除失败不影响使用
  }

  const status = failures === 0 ? "merged" : "partial";
  console.log(`[Cyrene] 用户数据目录合并迁移完成（${status}）: ${legacyPath} -> ${input.targetUserDataPath}`);
  return { status };
}
