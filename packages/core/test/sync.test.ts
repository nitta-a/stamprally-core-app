import { describe, expect, it } from "vitest";
import {
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
});
