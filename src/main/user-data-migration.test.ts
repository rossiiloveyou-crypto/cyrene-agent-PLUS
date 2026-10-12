import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { migrateLegacyUserData } from "./user-data-migration";

// 用临时目录模拟 appData，构造旧目录 live2d-cyrene 与新目录 Cyrene 的各种组合
let root: string;

function legacyDir(): string {
  return path.join(root, "live2d-cyrene");
}

function targetDir(): string {
  return path.join(root, "Cyrene");
}

function writeFixture(dir: string, name: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-migration-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("migrateLegacyUserData", () => {
  it("旧目录不存在时什么都不做", () => {
    const result = migrateLegacyUserData({ appDataPath: root, targetUserDataPath: targetDir() });
    expect(result.status).toBe("none");
    expect(fs.existsSync(legacyDir())).toBe(false);
    expect(fs.existsSync(targetDir())).toBe(false);
  });

  it("新旧目录路径一致时跳过", () => {
    fs.mkdirSync(legacyDir(), { recursive: true });
    const result = migrateLegacyUserData({ appDataPath: root, targetUserDataPath: legacyDir() });
    expect(result.status).toBe("skipped");
    expect(fs.existsSync(legacyDir())).toBe(true);
  });

  it("目标不存在时整体重命名", () => {
    writeFixture(legacyDir(), "app-settings.json", "{}");
    writeFixture(legacyDir(), "cyrene-chats/conv-1.json", "{}");

    const result = migrateLegacyUserData({ appDataPath: root, targetUserDataPath: targetDir() });

    expect(result.status).toBe("renamed");
    expect(fs.existsSync(legacyDir())).toBe(false);
    expect(fs.existsSync(path.join(targetDir(), "app-settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir(), "cyrene-chats/conv-1.json"))).toBe(true);
  });

  it("两者并存时逐项并入且旧数据优先", () => {
    // 旧目录：真实用户数据
    writeFixture(legacyDir(), "app-settings.json", '{"language":"zh-CN"}');
    writeFixture(legacyDir(), "memory.json", "{}");
    // 新目录：安装器写入的文件 + 一个会被旧数据覆盖的残留
    writeFixture(targetDir(), "installer-options.json", '{"launchAtLogin":true}');
    writeFixture(targetDir(), "app-settings.json", '{"petVisible":false}');

    const result = migrateLegacyUserData({ appDataPath: root, targetUserDataPath: targetDir() });

    expect(result.status).toBe("merged");
    // 旧数据覆盖新目录同名文件
    expect(fs.readFileSync(path.join(targetDir(), "app-settings.json"), "utf8")).toBe('{"language":"zh-CN"}');
    // 新目录独有文件保留（开机自启勾选不能丢）
    expect(fs.readFileSync(path.join(targetDir(), "installer-options.json"), "utf8")).toBe('{"launchAtLogin":true}');
    expect(fs.existsSync(path.join(targetDir(), "memory.json"))).toBe(true);
    // 全部搬空后旧目录移除
    expect(fs.existsSync(legacyDir())).toBe(false);
  });

  it("运行时锁文件不迁移：保留新目录版本，丢弃旧目录陈旧副本", () => {
    writeFixture(legacyDir(), "lockfile", "stale-pid");
    writeFixture(legacyDir(), "memory.json", "{}");
    writeFixture(targetDir(), "lockfile", "fresh-pid");

    const result = migrateLegacyUserData({ appDataPath: root, targetUserDataPath: targetDir() });

    expect(result.status).toBe("merged");
    expect(fs.readFileSync(path.join(targetDir(), "lockfile"), "utf8")).toBe("fresh-pid");
    expect(fs.existsSync(path.join(targetDir(), "memory.json"))).toBe(true);
    expect(fs.existsSync(legacyDir())).toBe(false);
  });
});
