import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  userDataDir: "",
  /** number（旧 Electron）或 { response }（新 Electron） */
  dialogResult: 0 as number | { response: number },
}));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
  dialog: {
    showMessageBoxSync: vi.fn(() => electronMock.dialogResult),
  },
}));

const deletionMock = vi.hoisted(() => ({
  deleteAllMemory: vi.fn(() => ({ deleted: ["memory.json"], failed: [] })),
}));

vi.mock("./memory-deletion", () => ({
  deleteAllMemory: deletionMock.deleteAllMemory,
}));

import { CURRENT_MEMORY_SCHEMA_VERSION } from "./memory-store-defaults";
import { readMemorySchemaVersion, runMemorySchemaGate } from "./memory-schema-gate";

function writeMemoryFile(value: unknown, raw = false): void {
  const file = path.join(electronMock.userDataDir, "memory.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, raw ? String(value) : JSON.stringify(value), "utf8");
}

describe("runMemorySchemaGate", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-gate-"));
    electronMock.dialogResult = 0;
    deletionMock.deleteAllMemory.mockClear();
  });

  it("returns ok when memory.json does not exist", () => {
    expect(runMemorySchemaGate()).toBe("ok");
    expect(deletionMock.deleteAllMemory).not.toHaveBeenCalled();
  });

  it("returns ok when the store is already at the current version", () => {
    writeMemoryFile({ schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION });
    expect(runMemorySchemaGate()).toBe("ok");
    expect(deletionMock.deleteAllMemory).not.toHaveBeenCalled();
  });

  it("wipes legacy memory when the user confirms", () => {
    writeMemoryFile({ schemaVersion: 2 });
    electronMock.dialogResult = 0;

    expect(runMemorySchemaGate()).toBe("migrated");
    expect(deletionMock.deleteAllMemory).toHaveBeenCalledTimes(1);
  });

  it("aborts without deleting when the user declines", () => {
    writeMemoryFile({ schemaVersion: 2 });
    electronMock.dialogResult = 1;

    expect(runMemorySchemaGate()).toBe("aborted");
    expect(deletionMock.deleteAllMemory).not.toHaveBeenCalled();
    // 旧文件安然无恙，用户可以先去备份
    expect(fs.existsSync(path.join(electronMock.userDataDir, "memory.json"))).toBe(true);
  });

  it("treats a malformed memory.json as needing a wipe", () => {
    writeMemoryFile("{ not json", true);
    expect(readMemorySchemaVersion(electronMock.userDataDir)).toBe(0);
    expect(runMemorySchemaGate()).toBe("migrated");
  });

  it("treats a missing schemaVersion field as v0", () => {
    writeMemoryFile({ l0: {}, l1: {} });
    expect(readMemorySchemaVersion(electronMock.userDataDir)).toBe(0);
    expect(runMemorySchemaGate()).toBe("migrated");
  });

  it("accepts the { response } shape returned by newer Electron", () => {
    writeMemoryFile({ schemaVersion: 2 });
    electronMock.dialogResult = { response: 1 };
    expect(runMemorySchemaGate()).toBe("aborted");
    expect(deletionMock.deleteAllMemory).not.toHaveBeenCalled();
  });

  it("reports a missing file as null so callers can skip the gate", () => {
    expect(readMemorySchemaVersion(path.join(electronMock.userDataDir, "nope"))).toBeNull();
  });
});
