import { describe, expect, it, vi } from "vitest";
import {
  calculateProgress,
  evaluateCondition,
  InMemoryStorage,
  processStamp,
  type RallyConfig,
  StampRallyClient,
  type StampRallyState,
  type StampStorage,
} from "../src/index.js";

const NOW = "2026-08-23T12:00:00.000Z";

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

describe("evaluateCondition", () => {
  it("compares tokens exactly", () => {
    expect(
      evaluateCondition({ type: "token", token: "ABC" }, { type: "token", token: "ABC" }),
    ).toBe(true);
    expect(
      evaluateCondition({ type: "token", token: "ABC" }, { type: "token", token: "abc" }),
    ).toBe(false);
  });

  it("uses an inclusive radius for geographic conditions", () => {
    const condition = {
      type: "geo" as const,
      latitude: 35,
      longitude: 139,
      radiusMeters: 0,
    };

    expect(
      evaluateCondition(condition, {
        type: "geo",
        currentLatitude: 35,
        currentLongitude: 139,
      }),
    ).toBe(true);
    expect(
      evaluateCondition(condition, {
        type: "geo",
        currentLatitude: 35.0001,
        currentLongitude: 139,
      }),
    ).toBe(false);
  });

  it("evaluates paired composite conditions and rejects shape mismatches", () => {
    const andCondition = {
      type: "composite" as const,
      operator: "AND" as const,
      conditions: [{ type: "instant" as const }, { type: "token" as const, token: "OK" }],
    };

    expect(
      evaluateCondition(andCondition, {
        type: "composite",
        contexts: [{ type: "instant" }, { type: "token", token: "OK" }],
      }),
    ).toBe(true);
    expect(
      evaluateCondition(andCondition, {
        type: "composite",
        contexts: [{ type: "instant" }],
      }),
    ).toBe(false);
    expect(
      evaluateCondition(
        {
          type: "composite",
          operator: "OR",
          conditions: [{ type: "token", token: "expected" }, { type: "instant" }],
        },
        {
          type: "composite",
          contexts: [{ type: "token", token: "wrong" }, { type: "instant" }],
        },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { type: "composite", operator: "OR", conditions: [] },
        { type: "composite", contexts: [] },
      ),
    ).toBe(false);
    expect(
      evaluateCondition(
        { type: "composite", operator: "AND", conditions: [] },
        { type: "composite", contexts: [] },
      ),
    ).toBe(true);
  });
});

describe("processStamp", () => {
  it("acquires a stamp without mutating the current state", () => {
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
    expect(result.value.events).toEqual([
      { type: "stampAcquired", record: { stampId: "first", acquiredAt: NOW } },
    ]);
  });

  it("returns an error for a duplicate stamp", () => {
    const state = createState([{ stampId: "first", acquiredAt: NOW }]);
    const result = processStamp(
      state,
      sequentialConfig,
      "first",
      { type: "token", token: "A" },
      NOW,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "STAMP_ALREADY_ACQUIRED", stampId: "first" },
    });
  });

  it("uses order before array position for sequential acquisition", () => {
    const result = processStamp(
      createState(),
      sequentialConfig,
      "second",
      { type: "token", token: "B" },
      NOW,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STAMP_OUT_OF_ORDER",
        stampId: "second",
        expectedStampId: "first",
      },
    });
  });

  it("places stamps without order after explicitly ordered stamps", () => {
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

  it("returns an error when the verification condition is not met", () => {
    const result = processStamp(
      createState(),
      sequentialConfig,
      "first",
      { type: "token", token: "wrong" },
      NOW,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "CONDITION_NOT_MET", stampId: "first" },
    });
  });

  it("returns an error for an unknown stamp", () => {
    const result = processStamp(
      createState(),
      sequentialConfig,
      "missing",
      { type: "instant" },
      NOW,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "STAMP_NOT_FOUND", stampId: "missing" },
    });
  });
});

describe("calculateProgress", () => {
  it("reports empty, partial, and completed rallies", () => {
    expect(calculateProgress(createState(), sequentialConfig)).toEqual({
      acquired: 0,
      total: 3,
      percentage: 0,
      isComplete: false,
    });
    const partialProgress = calculateProgress(
      createState([{ stampId: "first", acquiredAt: NOW }]),
      sequentialConfig,
    );
    expect(partialProgress).toMatchObject({
      acquired: 1,
      total: 3,
      isComplete: false,
    });
    expect(partialProgress.percentage).toBeCloseTo(100 / 3);
    expect(
      calculateProgress(
        createState([
          { stampId: "first", acquiredAt: NOW },
          { stampId: "second", acquiredAt: NOW },
          { stampId: "fallback", acquiredAt: NOW },
        ]),
        sequentialConfig,
      ),
    ).toEqual({ acquired: 3, total: 3, percentage: 100, isComplete: true });
  });

  it("treats a rally with no configured stamps as incomplete", () => {
    expect(calculateProgress(createState(), { id: "empty", stamps: [] })).toEqual({
      acquired: 0,
      total: 0,
      percentage: 0,
      isComplete: false,
    });
  });
});

describe("StampRallyClient", () => {
  it("keeps defensive copies in memory storage", async () => {
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
  });

  it("restores state and emits changes until unsubscribed", async () => {
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
    expect(storage.state?.records).toHaveLength(2);
  });
});
