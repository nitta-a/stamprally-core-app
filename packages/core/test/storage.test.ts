import { indexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  exportProgressToken,
  IndexedDBAdapter,
  InMemoryStorage,
  importProgressToken,
  isRewardState,
  isStampRallyState,
  LocalStorageAdapter,
  type RallySnapshot,
  type StampRallyState,
} from "../src/index.js";

const state: StampRallyState = {
  rallyId: "rally",
  userId: "user",
  records: [
    { stampId: "spot", acquiredAt: "2026-01-01T00:00:00.000Z", metadata: { source: "test" } },
  ],
  rewards: [{ rewardId: "reward", status: "AVAILABLE", unlockedAt: "2026-01-01T00:00:00.000Z" }],
  inventory: { sharedRemaining: 2, rewardRemaining: { reward: 1 } },
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("state validation and in-memory storage", () => {
  it("validates state shapes and clones nested mutable values", async () => {
    expect(isStampRallyState(state)).toBe(true);
    expect(isStampRallyState({ ...state, records: [{ stampId: "spot" }] })).toBe(false);
    expect(
      isRewardState({ rewardId: "reward", status: "AVAILABLE", unlockedAt: "not-a-date" }),
    ).toBe(false);
    expect(isRewardState({ rewardId: "reward", status: "AVAILABLE" })).toBe(true);

    const storage = new InMemoryStorage();
    await storage.save(state);
    const loaded = await storage.load("rally", "user");
    expect(loaded).toEqual(state);
    if (loaded === null) return;
    (loaded.records[0]?.metadata as Record<string, unknown>).source = "changed";
    (loaded.inventory?.rewardRemaining as Record<string, number>).reward = 0;
    expect((await storage.load("rally", "user"))?.records[0]?.metadata?.source).toBe("test");
    expect((await storage.load("rally", "user"))?.inventory?.rewardRemaining?.reward).toBe(1);
  });
});

describe("progress tokens", () => {
  const snapshot: RallySnapshot = {
    version: 1,
    rallyId: "rally",
    userId: null,
    records: [{ stampId: "spot", acquiredAt: "2026-01-01T00:00:00.000Z" }],
    rewards: [{ rewardId: "reward", status: "AVAILABLE" }],
    exportedAt: "2026-01-01T00:00:00.000Z",
  };

  it("round-trips valid snapshots and rejects mismatched or malformed data", () => {
    const token = exportProgressToken(snapshot);
    expect(importProgressToken(token, "rally")).toEqual(snapshot);
    expect(importProgressToken(token, "other")).toBeNull();
    expect(importProgressToken("not-a-token", "rally")).toBeNull();

    const invalid = JSON.parse(decodeURIComponent(atob(token))) as Record<string, unknown>;
    invalid.exportedAt = "invalid";
    expect(
      importProgressToken(btoa(encodeURIComponent(JSON.stringify(invalid))), "rally"),
    ).toBeNull();
  });
});

describe("LocalStorageAdapter", () => {
  it("persists, removes, and falls back after a storage failure", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const adapter = new LocalStorageAdapter({ storage, keyPrefix: "test:" });
    await adapter.save(state);
    expect(await adapter.load("rally", "user")).toEqual(state);
    await adapter.remove("rally", "user");
    expect(await adapter.load("rally", "user")).toBeNull();

    const warnings: string[] = [];
    let failed = false;
    const failingStorage = {
      getItem: () => {
        failed = true;
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const fallback = new LocalStorageAdapter({
      storage: failingStorage,
      onWarning: (error) => warnings.push(error.code),
    });
    expect(await fallback.load("rally", "user")).toBeNull();
    expect(failed).toBe(true);
    expect(warnings).toEqual(["STORAGE_READ_FAILED"]);
    await fallback.save(state);
    expect(await fallback.load("rally", "user")).toEqual(state);
  });

  it("can surface storage failures when configured to throw", async () => {
    const adapter = new LocalStorageAdapter({
      storage: null,
      failureMode: "throw",
    });
    await expect(adapter.load("rally", "user")).rejects.toMatchObject({
      name: "StorageAdapterError",
      code: "STORAGE_UNAVAILABLE",
      operation: "load",
    });
  });
});

describe("IndexedDBAdapter", () => {
  it("saves, loads, and removes isolated user state", async () => {
    const adapter = new IndexedDBAdapter({
      indexedDB,
      databaseName: `test-${crypto.randomUUID()}`,
    });
    await adapter.save(state);
    expect(await adapter.load("rally", "user")).toEqual(state);
    expect(await adapter.load("rally", "other")).toBeNull();
    await adapter.remove("rally", "user");
    expect(await adapter.load("rally", "user")).toBeNull();
  });

  it("reports unavailable IndexedDB without touching browser globals", async () => {
    const adapter = new IndexedDBAdapter({ indexedDB: null });
    await expect(adapter.load("rally", "user")).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
      operation: "open",
    });
  });
});
