import { describe, expect, it } from "vitest";
import {
  evaluateSpotStatus,
  InMemoryOfflineQueueStorage,
  OfflineQueue,
  resolveRallyStateConflict,
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
  it("merges stamp records and gives consumed rewards priority", () => {
    const server = state(["server"], "CONSUMED");
    const local = {
      ...state(["local"], "AVAILABLE"),
      rewards: [...state([], "AVAILABLE").rewards, { rewardId: "r2", status: "CONSUMED" as const }],
    };
    const merged = resolveRallyStateConflict(server, local);
    expect(merged.records.map((record) => record.stampId)).toEqual(["server", "local"]);
    expect(merged.rewards).toEqual([
      { rewardId: "r1", status: "CONSUMED" },
      { rewardId: "r2", status: "CONSUMED" },
    ]);
    expect(server.records).toHaveLength(1);
    expect(local.records).toHaveLength(1);
  });

  it("returns the server state for server_wins", () => {
    const server = state(["server"], "LOCKED");
    const local = state(["local"], "CONSUMED");
    expect(resolveRallyStateConflict(server, local, { policy: "server_wins" })).toBe(server);
  });
});

describe("OfflineQueue conflict synchronization", () => {
  it("resolves conflicts, notifies the client, and removes the operation", async () => {
    const storage = new InMemoryOfflineQueueStorage();
    const queue = new OfflineQueue({ storage, key: "conflict", conflictPolicy: "merge" });
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
    expect(events).toEqual(["server,local"]);
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
