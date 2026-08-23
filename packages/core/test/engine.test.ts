import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  calculateProgress,
  consumeReward,
  evaluateCondition,
  evaluateConditionDetailed,
  exportProgressToken,
  IndexedDBAdapter,
  InMemoryStorage,
  importProgressToken,
  LocalStorageAdapter,
  processStamp,
  type RallyConfig,
  type RallySnapshot,
  type RewardItem,
  type RewardState,
  StampRallyClient,
  type StampRallyState,
  type StampStorage,
  StorageAdapterError,
  type StorageLike,
} from "../src/index.js";

const NOW = "2026-08-23T12:00:00.000Z";
const CENTER = { latitude: 35, longitude: 139 } as const;

const sequentialConfig: RallyConfig = {
  id: "test-rally",
  isSequential: true,
  stamps: [
    { id: "second", name: "Second", order: 2, condition: { type: "token", token: "B" } },
    { id: "first", name: "First", order: 1, condition: { type: "token", token: "A" } },
    { id: "fallback", name: "Fallback", condition: { type: "instant" } },
  ],
};

function createState(records: StampRallyState["records"] = []): StampRallyState {
  return {
    rallyId: sequentialConfig.id,
    records,
    updatedAt: "2026-08-23T11:00:00.000Z",
  };
}

describe("condition evaluation", () => {
  it("keeps the boolean token API compatible", () => {
    expect(
      evaluateCondition({ type: "token", token: "ABC" }, { type: "token", token: "ABC" }),
    ).toBe(true);
    expect(
      evaluateCondition({ type: "token", token: "ABC" }, { type: "token", token: "abc" }),
    ).toBe(false);
  });

  it("evaluates geographic boundaries and reports the excess distance", () => {
    const context = {
      type: "geo" as const,
      currentLatitude: 35.001,
      currentLongitude: 139,
    };
    const inside = evaluateConditionDetailed(
      { type: "geo", ...CENTER, radiusMeters: 112 },
      context,
      NOW,
    );
    expect(inside.ok).toBe(true);
    if (!inside.ok) return;
    expect(inside.value.distanceMeters).toBeCloseTo(111.19, 1);

    const outside = evaluateConditionDetailed(
      { type: "geo", ...CENTER, radiusMeters: 110 },
      context,
      NOW,
    );
    expect(outside.ok).toBe(false);
    if (outside.ok || outside.error.reason !== "OUTSIDE_RADIUS") return;
    expect(outside.error.distanceMeters).toBeCloseTo(111.19, 1);
    expect(outside.error.radiusMeters).toBe(110);
    expect(outside.error.differenceMeters).toBeCloseTo(1.19, 1);

    expect(
      evaluateConditionDetailed(
        { type: "geo", ...CENTER, radiusMeters: 0 },
        { type: "geo", currentLatitude: 35, currentLongitude: 139 },
        NOW,
      ).ok,
    ).toBe(true);
  });

  it("recursively evaluates GPS and token composite conditions", () => {
    const condition = {
      type: "composite" as const,
      operator: "AND" as const,
      conditions: [
        { type: "geo" as const, ...CENTER, radiusMeters: 50 },
        {
          type: "composite" as const,
          operator: "OR" as const,
          conditions: [
            { type: "token" as const, token: "PRIMARY" },
            { type: "token" as const, token: "BACKUP" },
          ],
        },
      ],
    };
    const matchingContext = {
      type: "composite" as const,
      contexts: [
        { type: "geo" as const, currentLatitude: 35, currentLongitude: 139 },
        {
          type: "composite" as const,
          contexts: [
            { type: "token" as const, token: "wrong" },
            { type: "token" as const, token: "BACKUP" },
          ],
        },
      ],
    };

    expect(evaluateConditionDetailed(condition, matchingContext, NOW).ok).toBe(true);

    const failed = evaluateConditionDetailed(
      condition,
      {
        ...matchingContext,
        contexts: [
          { type: "geo", currentLatitude: 35, currentLongitude: 139 },
          {
            type: "composite",
            contexts: [
              { type: "token", token: "wrong" },
              { type: "token", token: "also-wrong" },
            ],
          },
        ],
      },
      NOW,
    );
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error).toMatchObject({
      conditionType: "composite",
      reason: "AND_CHILD_FAILED",
      failures: [{ index: 1 }],
    });
  });

  it("rejects composite shape mismatches and preserves empty boolean identities", () => {
    expect(
      evaluateConditionDetailed(
        { type: "composite", operator: "AND", conditions: [{ type: "instant" }] },
        { type: "composite", contexts: [] },
        NOW,
      ),
    ).toMatchObject({
      ok: false,
      error: { reason: "CONTEXT_LENGTH_MISMATCH", expectedCount: 1, actualCount: 0 },
    });
    expect(
      evaluateCondition(
        { type: "composite", operator: "AND", conditions: [] },
        { type: "composite", contexts: [] },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { type: "composite", operator: "OR", conditions: [] },
        { type: "composite", contexts: [] },
      ),
    ).toBe(false);
  });

  it("uses inclusive time window boundaries before evaluating the child condition", () => {
    const condition = {
      type: "time_window" as const,
      startsAt: "2026-08-23T10:00:00.000Z",
      endsAt: "2026-08-23T14:00:00.000Z",
      condition: { type: "token" as const, token: "OPEN" },
    };
    const context = { type: "token" as const, token: "OPEN" };

    expect(evaluateConditionDetailed(condition, context, condition.startsAt).ok).toBe(true);
    expect(evaluateConditionDetailed(condition, context, condition.endsAt).ok).toBe(true);
    expect(evaluateConditionDetailed(condition, context, "2026-08-23T09:59:59.999Z")).toMatchObject(
      { ok: false, error: { reason: "BEFORE_START" } },
    );
    expect(evaluateConditionDetailed(condition, context, "2026-08-23T14:00:00.001Z")).toMatchObject(
      { ok: false, error: { reason: "AFTER_END" } },
    );
    expect(
      evaluateConditionDetailed({ ...condition, startsAt: "invalid" }, context, NOW),
    ).toMatchObject({ ok: false, error: { reason: "INVALID_TIME_WINDOW" } });
    expect(evaluateConditionDetailed(condition, context, "invalid")).toMatchObject({
      ok: false,
      error: { reason: "INVALID_NOW" },
    });
  });
});

describe("processStamp", () => {
  it("acquires a stamp immutably and emits acquisition events", () => {
    const state = createState();
    const result = processStamp(
      state,
      sequentialConfig,
      "first",
      { type: "token", token: "A" },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.records).toEqual([]);
    expect(result.value.nextState).not.toBe(state);
    expect(result.value.nextState.records).toEqual([{ stampId: "first", acquiredAt: NOW }]);
    expect(result.value.events[0]).toEqual({
      type: "stampAcquired",
      record: { stampId: "first", acquiredAt: NOW },
    });
  });

  it("returns duplicate, invalid order, condition mismatch, and unknown errors", () => {
    expect(
      processStamp(
        createState([{ stampId: "first", acquiredAt: NOW }]),
        sequentialConfig,
        "first",
        { type: "token", token: "A" },
        NOW,
      ),
    ).toEqual({
      ok: false,
      error: { code: "STAMP_ALREADY_ACQUIRED", stampId: "first" },
    });
    expect(
      processStamp(createState(), sequentialConfig, "second", { type: "token", token: "B" }, NOW),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_ORDER", stampId: "second", expectedStampId: "first" },
    });
    expect(
      processStamp(
        createState(),
        sequentialConfig,
        "first",
        { type: "token", token: "wrong" },
        NOW,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CONDITION_MISMATCH",
        stampId: "first",
        mismatch: { reason: "TOKEN_MISMATCH" },
      },
    });
    expect(
      processStamp(createState(), sequentialConfig, "missing", { type: "instant" }, NOW),
    ).toEqual({
      ok: false,
      error: { code: "STAMP_NOT_FOUND", stampId: "missing" },
    });
  });

  it("emits a completion event after the last ordered stamp", () => {
    const state = createState([
      { stampId: "first", acquiredAt: NOW },
      { stampId: "second", acquiredAt: NOW },
    ]);
    const result = processStamp(state, sequentialConfig, "fallback", { type: "instant" }, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events.at(-1)).toEqual({
      type: "rallyCompleted",
      rallyId: sequentialConfig.id,
      completedAt: NOW,
    });
  });
});

describe("calculateProgress", () => {
  it("returns only the next ordered stamp in sequential mode", () => {
    const initial = calculateProgress(createState(), sequentialConfig);
    expect(initial).toMatchObject({
      acquired: 0,
      total: 3,
      percentage: 0,
      isCompleted: false,
      isComplete: false,
    });
    expect(initial.nextAvailableStamps.map((stamp) => stamp.id)).toEqual(["first"]);

    const partial = calculateProgress(
      createState([{ stampId: "first", acquiredAt: NOW }]),
      sequentialConfig,
    );
    expect(partial.percentage).toBeCloseTo(100 / 3);
    expect(partial.nextAvailableStamps.map((stamp) => stamp.id)).toEqual(["second"]);
  });

  it("returns all remaining stamps in free mode and none when completed", () => {
    const freeConfig = { ...sequentialConfig, isSequential: false };
    expect(
      calculateProgress(
        createState([{ stampId: "first", acquiredAt: NOW }]),
        freeConfig,
      ).nextAvailableStamps.map((stamp) => stamp.id),
    ).toEqual(["second", "fallback"]);

    const completed = calculateProgress(
      createState([
        { stampId: "first", acquiredAt: NOW },
        { stampId: "second", acquiredAt: NOW },
        { stampId: "fallback", acquiredAt: NOW },
      ]),
      sequentialConfig,
    );
    expect(completed).toMatchObject({ percentage: 100, isCompleted: true, isComplete: true });
    expect(completed.nextAvailableStamps).toEqual([]);

    expect(calculateProgress(createState(), { id: "empty", stamps: [] })).toMatchObject({
      total: 0,
      percentage: 0,
      isCompleted: false,
      nextAvailableStamps: [],
    });
  });
});

class MemoryWebStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("storage adapters", () => {
  it("defensively saves, loads, and removes in-memory state", async () => {
    const storage = new InMemoryStorage();
    const original = createState([
      { stampId: "first", acquiredAt: NOW, metadata: { source: "test" } },
    ]);
    await storage.save(original);
    const loaded = await storage.load(original.rallyId);

    expect(loaded).toEqual(original);
    expect(loaded).not.toBe(original);
    expect(loaded?.records).not.toBe(original.records);
    expect(loaded?.records[0]?.metadata).not.toBe(original.records[0]?.metadata);
    await storage.remove(original.rallyId);
    await expect(storage.load(original.rallyId)).resolves.toBeNull();
  });

  it("round-trips and removes localStorage state", async () => {
    const webStorage = new MemoryWebStorage();
    const storage = new LocalStorageAdapter({ storage: webStorage });
    const state = createState([{ stampId: "first", acquiredAt: NOW }]);

    await storage.save(state);
    await expect(storage.load(state.rallyId)).resolves.toEqual(state);
    expect(webStorage.values.has(`stamprally:${state.rallyId}`)).toBe(true);
    await storage.remove(state.rallyId);
    await expect(storage.load(state.rallyId)).resolves.toBeNull();
  });

  it("rejects corrupt localStorage data and wraps access failures", async () => {
    const webStorage = new MemoryWebStorage();
    webStorage.setItem(`stamprally:${sequentialConfig.id}`, "not-json");
    await expect(
      new LocalStorageAdapter({ storage: webStorage, failureMode: "throw" }).load(
        sequentialConfig.id,
      ),
    ).rejects.toMatchObject({ code: "STORAGE_INVALID_DATA", operation: "load" });

    const throwingStorage: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const failure = new LocalStorageAdapter({
      storage: throwingStorage,
      failureMode: "throw",
    }).load(sequentialConfig.id);
    await expect(failure).rejects.toBeInstanceOf(StorageAdapterError);
    await expect(failure).rejects.toMatchObject({ code: "STORAGE_READ_FAILED" });
  });

  it("reports explicitly unavailable browser storage", async () => {
    await expect(
      new LocalStorageAdapter({ storage: null, failureMode: "throw" }).load(sequentialConfig.id),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", operation: "load" });
    await expect(
      new IndexedDBAdapter({ indexedDB: null }).load(sequentialConfig.id),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", operation: "open" });
  });

  it("falls back to session memory after a localStorage failure", async () => {
    const warning = vi.fn();
    const throwingStorage: StorageLike = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    const storage = new LocalStorageAdapter({ storage: throwingStorage, onWarning: warning });
    const state = createState([{ stampId: "first", acquiredAt: NOW }]);

    await expect(storage.load(state.rallyId)).resolves.toBeNull();
    await storage.save(state);
    await expect(storage.load(state.rallyId)).resolves.toEqual(state);
    await storage.remove(state.rallyId);
    await expect(storage.load(state.rallyId)).resolves.toBeNull();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({ code: "STORAGE_READ_FAILED", operation: "load" }),
    );
  });

  it("wraps QuotaExceededError as a typed strict-mode write failure", async () => {
    const quotaStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    const storage = new LocalStorageAdapter({
      storage: quotaStorage,
      failureMode: "throw",
    });

    await expect(storage.save(createState())).rejects.toMatchObject({
      code: "STORAGE_WRITE_FAILED",
      operation: "save",
    });
  });

  it("uses the same fallback behavior when localStorage is unavailable during SSR", async () => {
    const warning = vi.fn();
    const storage = new LocalStorageAdapter({ storage: null, onWarning: warning });
    const state = createState([{ stampId: "first", acquiredAt: NOW }]);

    await storage.save(state);
    await expect(storage.load(state.rallyId)).resolves.toEqual(state);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({ code: "STORAGE_UNAVAILABLE", operation: "save" }),
    );
  });

  it("round-trips and removes IndexedDB state", async () => {
    const storage = new IndexedDBAdapter({
      indexedDB: new IDBFactory(),
      databaseName: "stamprally-test",
    });
    const state = createState([{ stampId: "first", acquiredAt: NOW }]);

    await storage.save(state);
    await expect(storage.load(state.rallyId)).resolves.toEqual(state);
    await storage.remove(state.rallyId);
    await expect(storage.load(state.rallyId)).resolves.toBeNull();
  });
});

describe("StampRallyClient", () => {
  it("keeps a stable synchronous snapshot and preserves it after failures", async () => {
    class FailingSaveStorage extends InMemoryStorage {
      override async save(): Promise<void> {
        throw new Error("save failed");
      }
    }

    const storage = new FailingSaveStorage();
    const client = new StampRallyClient(sequentialConfig, storage, () => NOW);
    expect(client.getState()).toBeNull();

    const initialization = client.init();
    expect(client.init()).toBe(initialization);
    const initialized = await initialization;
    expect(client.getState()).toBe(initialized);
    expect(client.getState()).toBe(initialized);

    const mismatch = await client.acquire("first", { type: "token", token: "wrong" }, NOW);
    expect(mismatch.ok).toBe(false);
    expect(client.getState()).toBe(initialized);

    await expect(client.acquire("first", { type: "token", token: "A" }, NOW)).rejects.toThrow(
      "save failed",
    );
    expect(client.getState()).toBe(initialized);
  });

  it("restores state, emits changes, and stops after unsubscribe", async () => {
    const storage = new InMemoryStorage();
    await storage.save(createState([{ stampId: "first", acquiredAt: NOW }]));
    const client = new StampRallyClient(sequentialConfig, storage, () => NOW);
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);

    const restored = await client.initialize();
    expect(restored.records).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await client.acquire("second", { type: "token", token: "B" }, NOW);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent acquisitions", async () => {
    const config: RallyConfig = {
      id: "concurrent",
      stamps: [
        { id: "one", name: "One", condition: { type: "instant" } },
        { id: "two", name: "Two", condition: { type: "instant" } },
      ],
    };

    class DelayedStorage implements StampStorage {
      state: StampRallyState | null = null;

      async load(): Promise<StampRallyState | null> {
        return this.state;
      }

      async save(state: StampRallyState): Promise<void> {
        await Promise.resolve();
        this.state = state;
      }

      async remove(): Promise<void> {
        this.state = null;
      }
    }

    const storage = new DelayedStorage();
    const client = new StampRallyClient(config, storage, () => NOW);
    const [first, second] = await Promise.all([
      client.acquire("one", { type: "instant" }, NOW),
      client.acquire("two", { type: "instant" }, NOW),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(client.getState()?.records.map((record) => record.stampId)).toEqual(["one", "two"]);
  });

  it("removes persisted data and emits an empty state on reset", async () => {
    const storage = new InMemoryStorage();
    const client = new StampRallyClient(sequentialConfig, storage, () => NOW);
    const listener = vi.fn();
    client.subscribe(listener);
    await client.acquire("first", { type: "token", token: "A" }, NOW);

    const resetState = await client.reset("2026-08-23T13:00:00.000Z");
    expect(resetState).toEqual({
      rallyId: sequentialConfig.id,
      records: [],
      updatedAt: "2026-08-23T13:00:00.000Z",
    });
    await expect(storage.load(sequentialConfig.id)).resolves.toBeNull();
    expect(listener).toHaveBeenLastCalledWith(resetState);
  });

  it("does not let an in-flight restore overwrite a reset", async () => {
    let finishLoad: ((state: StampRallyState) => void) | undefined;
    const restoredState = createState([{ stampId: "first", acquiredAt: NOW }]);

    class SlowStorage implements StampStorage {
      async load(): Promise<StampRallyState> {
        return new Promise((resolve) => {
          finishLoad = resolve;
        });
      }

      async save(): Promise<void> {}

      async remove(): Promise<void> {}
    }

    const client = new StampRallyClient(sequentialConfig, new SlowStorage(), () => NOW);
    const initialization = client.initialize();
    const reset = client.reset("2026-08-23T14:00:00.000Z");
    finishLoad?.(restoredState);

    await initialization;
    const resetState = await reset;
    expect(client.getState()).toEqual(resetState);
    expect(resetState.records).toEqual([]);
  });
});

const staffReward: RewardItem = {
  id: "staff-reward",
  title: "Counter gift",
  description: "Redeem at the counter",
  type: "in_person",
  redemptionMethod: "staff_passcode",
  requiredStampCount: 1,
  staffPasscode: "staff123",
};

describe("reward lifecycle", () => {
  it("unlocks configured rewards when a stamp reaches the required count", () => {
    const config: RallyConfig = {
      id: "reward-rally",
      stamps: [{ id: "first", name: "First", condition: { type: "instant" } }],
      rewards: [staffReward],
    };
    const state: StampRallyState = {
      rallyId: config.id,
      records: [],
      rewards: [{ rewardId: staffReward.id, status: "LOCKED" }],
      updatedAt: "2026-08-23T11:00:00.000Z",
    };

    const result = processStamp(state, config, "first", { type: "instant" }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nextState.rewards).toEqual([
      { rewardId: staffReward.id, status: "AVAILABLE", unlockedAt: NOW },
    ]);
    expect(state.rewards).toEqual([{ rewardId: staffReward.id, status: "LOCKED" }]);
  });

  it("consumes a staff reward using an NFKC-normalized passcode", () => {
    const currentState: RewardState = {
      rewardId: staffReward.id,
      status: "AVAILABLE",
      unlockedAt: NOW,
    };
    const result = consumeReward({
      reward: staffReward,
      currentState,
      inputPasscode: "  ＳＴＡＦＦ１２３ ",
      staffId: "staff-7",
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        rewardId: staffReward.id,
        status: "CONSUMED",
        unlockedAt: NOW,
        consumedAt: NOW,
        consumedByStaffId: "staff-7",
      },
    });
    expect(currentState.status).toBe("AVAILABLE");
  });

  it("rejects a wrong passcode and prevents double redemption", () => {
    const available: RewardState = { rewardId: staffReward.id, status: "AVAILABLE" };
    expect(
      consumeReward({
        reward: staffReward,
        currentState: available,
        inputPasscode: "wrong",
        now: NOW,
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_PASSCODE" } });

    expect(
      consumeReward({
        reward: staffReward,
        currentState: { rewardId: staffReward.id, status: "CONSUMED", consumedAt: NOW },
        inputPasscode: "staff123",
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      error: { code: "ALREADY_CONSUMED", rewardId: staffReward.id },
    });
  });

  it("rejects locked, expired, and misconfigured staff rewards", () => {
    for (const status of ["LOCKED", "EXPIRED"] as const) {
      expect(
        consumeReward({
          reward: staffReward,
          currentState: { rewardId: staffReward.id, status },
          inputPasscode: "staff123",
          now: NOW,
        }),
      ).toEqual({
        ok: false,
        error: { code: "NOT_AVAILABLE", rewardId: staffReward.id },
      });
    }

    const misconfiguredReward: RewardItem = {
      id: staffReward.id,
      title: staffReward.title,
      description: staffReward.description,
      type: staffReward.type,
      redemptionMethod: staffReward.redemptionMethod,
      requiredStampCount: staffReward.requiredStampCount,
    };
    expect(
      consumeReward({
        reward: misconfiguredReward,
        currentState: { rewardId: staffReward.id, status: "AVAILABLE" },
        inputPasscode: "staff123",
        now: NOW,
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_PASSCODE" } });
  });

  it("consumes manual rewards but keeps view-only rewards available", () => {
    const available: RewardState = { rewardId: "reward", status: "AVAILABLE" };
    const manual = consumeReward({
      reward: {
        ...staffReward,
        id: "reward",
        redemptionMethod: "manual_slide",
      },
      currentState: available,
      now: NOW,
    });
    const viewOnly = consumeReward({
      reward: {
        ...staffReward,
        id: "reward",
        redemptionMethod: "view_only",
      },
      currentState: available,
      now: NOW,
    });

    expect(manual).toMatchObject({ ok: true, value: { status: "CONSUMED" } });
    expect(viewOnly).toEqual({ ok: true, value: available });
  });
});

describe("recovery tokens", () => {
  it("round-trips Unicode snapshot data and returns defensive arrays", () => {
    const snapshot: RallySnapshot = {
      version: 1,
      rallyId: "東京ラリー",
      stamps: [{ stampId: "入口", acquiredAt: NOW, metadata: { label: "獲得済み" } }],
      rewards: [{ rewardId: "記念品", status: "AVAILABLE", unlockedAt: NOW }],
      exportedAt: NOW,
    };

    const imported = importProgressToken(exportProgressToken(snapshot), snapshot.rallyId);
    expect(imported).toEqual(snapshot);
    expect(imported?.stamps).not.toBe(snapshot.stamps);
    expect(imported?.rewards).not.toBe(snapshot.rewards);
  });

  it("rejects malformed, cross-rally, wrong-version, and invalid-shape tokens", () => {
    const encode = (value: unknown) => globalThis.btoa(encodeURIComponent(JSON.stringify(value)));
    expect(importProgressToken("not base64!", "rally")).toBeNull();
    expect(
      importProgressToken(
        encode({ version: 1, rallyId: "other", stamps: [], rewards: [], exportedAt: NOW }),
        "rally",
      ),
    ).toBeNull();
    expect(
      importProgressToken(
        encode({ version: 2, rallyId: "rally", stamps: [], rewards: [], exportedAt: NOW }),
        "rally",
      ),
    ).toBeNull();
    expect(
      importProgressToken(
        encode({ version: 1, rallyId: "rally", stamps: {}, rewards: [], exportedAt: NOW }),
        "rally",
      ),
    ).toBeNull();
  });

  it("clones and restores reward state through memory storage and the client", async () => {
    const config: RallyConfig = {
      id: "reward-client",
      stamps: [{ id: "first", name: "First", condition: { type: "instant" } }],
      rewards: [staffReward],
    };
    const storage = new InMemoryStorage();
    await storage.save({
      rallyId: config.id,
      records: [{ stampId: "first", acquiredAt: NOW }],
      updatedAt: NOW,
    });
    const client = new StampRallyClient(config, storage, () => NOW);
    const initialized = await client.init();
    expect(initialized.rewards).toEqual([
      { rewardId: staffReward.id, status: "AVAILABLE", unlockedAt: NOW },
    ]);

    const listener = vi.fn();
    client.subscribe(listener);
    const restored = await client.restore({
      ...initialized,
      rewards: [{ rewardId: staffReward.id, status: "CONSUMED", consumedAt: NOW }],
    });
    expect(client.getState()).toBe(restored);
    expect(listener).toHaveBeenCalledWith(restored);
    await expect(storage.load(config.id)).resolves.toEqual(restored);

    const reset = await client.reset(NOW);
    expect(reset.rewards).toEqual([{ rewardId: staffReward.id, status: "LOCKED" }]);
  });

  it("round-trips reward state through every storage adapter", async () => {
    const values = new Map<string, string>();
    const localStorageLike: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const storages: ReadonlyArray<StampStorage> = [
      new InMemoryStorage(),
      new LocalStorageAdapter({ storage: localStorageLike, failureMode: "throw" }),
      new IndexedDBAdapter({
        indexedDB: new IDBFactory(),
        databaseName: "stamprally-reward-state-test",
      }),
    ];
    const state: StampRallyState = {
      rallyId: "adapter-rewards",
      records: [{ stampId: "first", acquiredAt: NOW }],
      rewards: [
        {
          rewardId: staffReward.id,
          status: "CONSUMED",
          unlockedAt: NOW,
          consumedAt: NOW,
          consumedByStaffId: "staff-1",
        },
      ],
      updatedAt: NOW,
    };

    for (const storage of storages) {
      await storage.save(state);
      const restored = await storage.load(state.rallyId);
      expect(restored).toEqual(state);
      expect(restored?.rewards).not.toBe(state.rewards);
      expect(restored?.rewards?.[0]).not.toBe(state.rewards?.[0]);
      await storage.remove(state.rallyId);
      await expect(storage.load(state.rallyId)).resolves.toBeNull();
    }
  });
});
