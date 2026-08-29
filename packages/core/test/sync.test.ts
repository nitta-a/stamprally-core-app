import { describe, expect, it } from "vitest";
import {
  createAnonymousSessionId,
  evaluateSpotStatus,
  InMemoryOfflineQueueStorage,
  OfflineQueue,
  rebuildUserStateFromLog,
  resolveRallyStateConflict,
  rollbackOptimisticOperation,
  StampRallyClient,
  toPublicConfig,
  type UserRallyState,
} from "../src/index.js";

const state = (
  records: ReadonlyArray<string>,
  rewardStatus: "LOCKED" | "AVAILABLE" | "CONSUMED",
): UserRallyState => ({
  rallyId: "rally",
  userId: "user",
  records: records.map((stampId) => ({ stampId, acquiredAt: "2026-01-01T00:00:00.000Z" })),
  rewards: [{ rewardId: "r1", status: rewardStatus }],
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("resolveRallyStateConflict", () => {
  it("uses the server snapshot as the replay baseline", () => {
    const server = state(["server"], "CONSUMED");
    const local = {
      ...state(["local"], "AVAILABLE"),
      rewards: [...state([], "AVAILABLE").rewards, { rewardId: "r2", status: "CONSUMED" as const }],
    };
    const merged = resolveRallyStateConflict(server, local);
    expect(merged.records.map((record) => record.stampId)).toEqual(["server"]);
    expect(merged.rewards).toEqual([{ rewardId: "r1", status: "CONSUMED" }]);
    expect(server.records).toHaveLength(1);
    expect(local.records).toHaveLength(1);
  });

  it("does not mutate the server baseline", () => {
    const server = state(["server"], "LOCKED");
    const local = state(["local"], "CONSUMED");
    expect(resolveRallyStateConflict(server, local)).not.toBe(server);
    expect(resolveRallyStateConflict(server, local)).toEqual(server);
  });
});

describe("rebuildUserStateFromLog", () => {
  it("keeps independent optimistic operations and removes failed prerequisite chains", () => {
    const baseline = state([], "LOCKED");
    const config = {
      id: "rally",
      version: "1",
      title: "Rally",
      spots: [
        { id: "a", orderIndex: 0, name: "A", conditions: [] },
        { id: "b", orderIndex: 1, name: "B", conditions: [] },
        { id: "c", orderIndex: 2, name: "C", prerequisites: ["a"], conditions: [] },
      ],
      rewards: [],
    } as const;
    const operation = (spotId: "a" | "b" | "c", status: "PENDING" | "REJECTED_PERMANENT") => ({
      kind: "checkIn" as const,
      status,
      request: {
        rallyId: "rally",
        userId: "user",
        spotId,
        proofData: "proof",
        idempotencyKey: spotId,
        now: `2026-01-01T00:00:0${spotId === "a" ? "1" : spotId === "b" ? "2" : "3"}.000Z`,
        state: baseline,
      },
    });
    const rebuilt = rebuildUserStateFromLog(
      baseline,
      [operation("a", "REJECTED_PERMANENT"), operation("b", "PENDING"), operation("c", "PENDING")],
      config,
    );
    expect(rebuilt.records.map((record) => record.stampId)).toEqual(["b"]);
  });
});

describe("OfflineQueue conflict synchronization", () => {
  it("rolls back an optimistic reward claim to its previous state", () => {
    const previous = state([], "AVAILABLE");
    const operation = {
      kind: "claimReward" as const,
      request: {
        rallyId: "rally",
        userId: "user",
        rewardId: "r1",
        idempotencyKey: "claim",
        now: "2026-01-01T00:00:01.000Z",
        options: {},
        state: previous,
      },
    };
    const optimistic = {
      ...previous,
      rewards: [{ rewardId: "r1", status: "CONSUMED" as const, claimTicketNumber: "ticket" }],
      inventory: { sharedRemaining: 0, rewardRemaining: { r1: 0 } },
    };
    expect(rollbackOptimisticOperation(optimistic, operation)).toEqual(previous);
    expect(optimistic.rewards[0]?.status).toBe("CONSUMED");
  });

  it("emits lifecycle events and persists an immediate permanent-rejection rollback", async () => {
    const config = toPublicConfig({
      id: "rally",
      version: "1",
      title: "Rally",
      spots: [
        { id: "s1", orderIndex: 0, name: "Spot", conditions: [{ type: "passcode", code: "OPEN" }] },
      ],
      rewards: [],
    });
    const queue = new OfflineQueue({
      storage: new InMemoryOfflineQueueStorage(),
      rallyId: "rally",
      userId: "user",
    });
    let offline = true;
    const client = new StampRallyClient(config, {
      offlineQueue: queue,
      userId: "user",
      syncAdapter: {
        checkIn: async () => {
          if (offline) throw new Error("offline");
          return {
            ok: false as const,
            error: { code: "INVALID_PROOF" as const, spotId: "s1", message: "Rejected" },
          };
        },
      },
    });
    const events: string[] = [];
    client.subscribeSyncEvents((event) => events.push(event.type));
    await client.checkIn("s1", "OPEN", { now: "2026-01-01T00:00:00.000Z" });
    expect(client.getState()?.records).toHaveLength(1);
    offline = false;
    await client.sync();
    expect(client.getState()?.records).toHaveLength(0);
    expect(events).toEqual(["SYNC_STARTED", "OPERATION_ROLLED_BACK", "SYNC_COMPLETED"]);
    expect((await client.getUserState("rally", "user"))?.records).toHaveLength(0);
  });

  it("rolls optimistic state back when the server permanently rejects an operation", async () => {
    const config = toPublicConfig({
      id: "rally",
      version: "1",
      title: "Rally",
      spots: [
        { id: "s1", orderIndex: 0, name: "Spot", conditions: [{ type: "passcode", code: "OPEN" }] },
      ],
      rewards: [],
    });
    const queue = new OfflineQueue({
      storage: new InMemoryOfflineQueueStorage(),
      rallyId: "rally",
      userId: "user",
    });
    let offline = true;
    const client = new StampRallyClient(config, {
      offlineQueue: queue,
      userId: "user",
      syncAdapter: {
        checkIn: async () => {
          if (offline) throw new Error("offline");
          return { ok: false, error: { code: "INVALID_PROOF", spotId: "s1", message: "Rejected" } };
        },
        sync: async () => ({
          rallyId: "rally",
          userId: "user",
          records: [],
          rewards: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      },
    });
    expect((await client.checkIn("s1", "OPEN", { now: "2026-01-01T00:00:00.000Z" })).ok).toBe(true);
    expect(client.getState()?.records).toHaveLength(1);
    offline = false;
    await client.sync();
    expect(client.getState()?.records).toHaveLength(0);
  });

  it("retries retryable operations with bounded exponential backoff", async () => {
    const queue = new OfflineQueue({
      storage: new InMemoryOfflineQueueStorage(),
      key: "retry-options",
      retryOptions: { maxRetries: 2, initialIntervalMs: 0, backoffMultiplier: 2 },
    });
    await queue.enqueueCheckIn({
      rallyId: "rally",
      userId: "user",
      spotId: "s1",
      proofData: "proof",
      idempotencyKey: "retry-options",
      now: "2026-01-01T00:00:00.000Z",
      state: state([], "LOCKED"),
    });
    let attempts = 0;
    await queue.sync(async () => {
      attempts += 1;
      if (attempts < 3)
        return { status: "RETRYABLE_ERROR", error: { code: "NETWORK", message: "Retry" } };
      return { status: "ACCEPTED", state: state(["s1"], "AVAILABLE") };
    });
    expect(attempts).toBe(3);
    expect(queue.pendingCount).toBe(0);
  });

  it("creates a persistent UUID v4 anonymous session id", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const first = createAnonymousSessionId(storage);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(createAnonymousSessionId(storage)).toBe(first);
  });

  it("resolves conflicts, notifies the client, and removes the operation", async () => {
    const storage = new InMemoryOfflineQueueStorage();
    const queue = new OfflineQueue({ storage, key: "conflict" });
    const request = {
      rallyId: "rally",
      userId: "user",
      spotId: "local",
      proofData: "proof",
      idempotencyKey: "operation",
      now: "2026-01-01T00:00:00.000Z",
      state: state(["local"], "AVAILABLE"),
    };
    await queue.enqueueCheckIn(request);
    const events: string[] = [];
    queue.setSyncResultListener((event) => {
      events.push(event.state?.records.map((record) => record.stampId).join(",") ?? "rejected");
    });
    await queue.sync(async () => ({
      conflict: true,
      localState: request.state,
      serverState: state(["server"], "LOCKED"),
    }));
    expect(queue.pendingCount).toBe(0);
    expect(events).toEqual(["server"]);
  });

  it("isolates the default queue by rally and user and switches scopes", async () => {
    const storage = new InMemoryOfflineQueueStorage();
    const queue = new OfflineQueue({ storage, rallyId: "rally", userId: "alice" });
    expect(queue.storageKey).toBe("stamprally:queue:rally:alice");
    await queue.enqueueCheckIn({
      rallyId: "rally",
      userId: "alice",
      spotId: "s1",
      proofData: "proof",
      idempotencyKey: "a",
      now: "2026-01-01T00:00:00.000Z",
      state: state([], "LOCKED"),
    });
    await queue.switchUser("bob");
    expect(queue.storageKey).toBe("stamprally:queue:rally:bob");
    expect(queue.pendingCount).toBe(0);
    await queue.switchUser("alice");
    expect(queue.pendingCount).toBe(1);
  });

  it("removes permanent rejections and keeps retryable failures queued", async () => {
    const storage = new InMemoryOfflineQueueStorage();
    const queue = new OfflineQueue({ storage, rallyId: "rally", userId: "user" });
    await queue.enqueueCheckIn({
      rallyId: "rally",
      userId: "user",
      spotId: "s1",
      proofData: "proof",
      idempotencyKey: "permanent",
      now: "2026-01-01T00:00:00.000Z",
      state: state([], "LOCKED"),
    });
    const events: string[] = [];
    queue.setSyncResultListener((event) => {
      events.push(event.error?.code ?? "none");
    });
    await queue.sync(async () => ({
      status: "REJECTED_PERMANENT",
      error: { code: "PREREQUISITES_NOT_MET", message: "Complete the previous spot." },
    }));
    expect(queue.pendingCount).toBe(0);
    expect(events).toEqual(["PREREQUISITES_NOT_MET"]);

    await queue.enqueueCheckIn({
      rallyId: "rally",
      userId: "user",
      spotId: "s2",
      proofData: "proof",
      idempotencyKey: "retry",
      now: "2026-01-01T00:00:00.000Z",
      state: state([], "LOCKED"),
    });
    await expect(
      queue.sync(async () => ({
        status: "RETRYABLE_ERROR",
        error: { code: "NETWORK", message: "Try again." },
      })),
    ).rejects.toThrow("Try again.");
    expect(queue.pendingCount).toBe(1);
  });

  it("keeps rejection reasons and can explicitly retry a rejected operation", async () => {
    const storage = new InMemoryOfflineQueueStorage();
    const queue = new OfflineQueue({ storage, key: "rejected-history" });
    const request = {
      rallyId: "rally",
      userId: "user",
      spotId: "s1",
      proofData: "proof",
      idempotencyKey: "rejected-history",
      now: "2026-01-01T00:00:00.000Z",
      state: state([], "LOCKED"),
    };
    await queue.enqueueCheckIn(request);
    await queue.sync(async () => ({
      status: "REJECTED_PERMANENT",
      reason: { code: "INVALID_PROOF", message: "The proof is no longer valid." },
    }));
    const operationId =
      queue.rejectedHistory[0] &&
      `${queue.rejectedHistory[0].operation.kind}:${request.rallyId}:${request.userId}:${request.idempotencyKey}`;
    expect(queue.rejectedHistory[0]).toMatchObject({
      errorCode: "INVALID_PROOF",
      reason: { message: "The proof is no longer valid." },
    });
    expect(operationId).toBeTruthy();
    await expect(queue.retryRejected(operationId ?? "")).resolves.toBe(true);
    expect(queue.rejectedHistory).toHaveLength(0);
    expect(queue.pendingCount).toBe(1);
  });
});

describe("evaluateSpotStatus", () => {
  it("locks a spot until every prerequisite is acquired", () => {
    const spot = { id: "s2", prerequisites: ["s1"] };
    expect(evaluateSpotStatus(spot, { records: [] })).toBe("LOCKED");
    expect(
      evaluateSpotStatus(spot, {
        records: [{ stampId: "s1", acquiredAt: "2026-01-01T00:00:00.000Z" }],
      }),
    ).toBe("UNCLAIMED");
    expect(evaluateSpotStatus({ id: "s1" }, { records: [{ stampId: "s1", acquiredAt: "" }] })).toBe(
      "CLAIMED",
    );
  });
});
