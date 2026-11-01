import { describe, expect, it, vi } from "vitest";
import {
  type AdminRallyConfig,
  type ClientEvent,
  InMemoryOfflineQueueStorage,
  InMemoryStorage,
  OfflineQueue,
  StampRallyClient,
  toPublicConfig,
} from "../src/index.js";

const config = toPublicConfig({
  id: "rally",
  version: "1",
  title: "Rally",
  spots: [
    {
      id: "custom",
      orderIndex: 0,
      name: "Custom",
      conditions: [{ type: "custom", validatorName: "demo" }],
    },
    {
      id: "passcode",
      orderIndex: 1,
      name: "Passcode",
      conditions: [{ type: "passcode", code: "OPEN" }],
    },
  ],
  rewards: [
    {
      id: "reward",
      title: "Reward",
      type: "digital",
      redemptionMethod: "manual_slide",
      requiredStampCount: 1,
    },
  ],
} satisfies AdminRallyConfig);

describe("StampRallyClient", () => {
  it("runs named custom validators and includes the current state in context", async () => {
    const validator = vi.fn(
      async (context: { proofData: unknown; spotId: string; userState: unknown }) => {
        expect(context.proofData).toEqual({ accepted: true });
        expect(context.spotId).toBe("custom");
        expect(context.userState).toMatchObject({ rallyId: "rally", records: [] });
        return { valid: true };
      },
    );
    const client = new StampRallyClient(config, {
      storage: new InMemoryStorage(),
      customValidators: { demo: validator },
      userId: "user",
      clock: () => "2026-01-01T00:00:00.000Z",
    });
    const result = await client.checkIn("custom", { accepted: true });
    expect(result.ok).toBe(true);
    expect(validator).toHaveBeenCalledOnce();
    expect(client.getState()?.records).toEqual([
      { stampId: "custom", acquiredAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("does not call a remote adapter for invalid proof and emits the error event", async () => {
    const remote = vi.fn(async () => ({
      ok: false as const,
      error: { code: "INVALID_PROOF" as const, spotId: "passcode", message: "Rejected." },
    }));
    const errors: string[] = [];
    const client = new StampRallyClient(config, {
      storage: new InMemoryStorage(),
      userId: "user",
      syncAdapter: { checkIn: remote },
    });
    client.subscribeEvents((event) => {
      if (event.type === "error") errors.push(event.error.code);
    });
    const result = await client.checkIn("passcode", "wrong");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_PROOF", spotId: "passcode" },
    });
    expect(remote).toHaveBeenCalledOnce();
    expect(errors).toEqual(["INVALID_PROOF"]);
  });

  it("claims an available reward immutably and emits claim events", async () => {
    const events: string[] = [];
    const client = new StampRallyClient(config, {
      storage: new InMemoryStorage(),
      userId: "user",
      clock: () => "2026-01-01T00:00:00.000Z",
    });
    client.subscribeEvents((event) => events.push(event.type));
    await client.checkIn("passcode", "OPEN");
    const claim = await client.claimReward("reward", { idempotencyKey: "claim-1" });
    expect(claim).toMatchObject({
      ok: true,
      value: { reward: { status: "CONSUMED", redeemedCount: 1 } },
    });
    expect(client.getState()?.rewards[0]?.claimTicketNumber).toMatch(/^CLAIM-reward-/u);
    expect(events).toEqual(["checkIn", "rewardClaimed"]);
  });

  it("resets only the current user and rejects restoring another user's state", async () => {
    const client = new StampRallyClient(config, { storage: new InMemoryStorage(), userId: "user" });
    await client.checkIn("passcode", "OPEN");
    await expect(
      client.restore({
        rallyId: "rally",
        userId: "other",
        records: [],
        rewards: [],
        updatedAt: "",
      }),
    ).rejects.toThrow("another rally or user");
    await client.reset();
    expect(client.getState()?.records).toEqual([]);
  });

  it("accepts a fallback condition when a spot has multiple check-in methods", async () => {
    const multiConfig = toPublicConfig({
      id: "rally",
      version: "1",
      title: "Rally",
      spots: [
        {
          id: "multi",
          orderIndex: 0,
          name: "Multi",
          conditions: [
            { type: "gps", latitude: 35, longitude: 139, radiusMeters: 10 },
            { type: "passcode", code: "OPEN" },
          ],
        },
      ],
      rewards: [],
    } satisfies AdminRallyConfig);
    const client = new StampRallyClient(multiConfig, {
      storage: new InMemoryStorage(),
      userId: "user",
      clock: () => "2026-01-01T00:00:00.000Z",
    });
    const result = await client.checkIn("multi", "OPEN");
    expect(result.ok).toBe(true);
    expect(client.getState()?.records).toEqual([
      { stampId: "multi", acquiredAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("persists server-verified check-ins and claims so they survive a reload", async () => {
    const storage = new InMemoryStorage();
    const now = "2026-01-01T00:00:00.000Z";
    const record = { stampId: "passcode", acquiredAt: now };
    const checkedIn = {
      rallyId: "rally",
      userId: "user",
      records: [record],
      rewards: [{ rewardId: "reward", status: "AVAILABLE" as const, unlockedAt: now }],
      updatedAt: now,
    };
    const consumed = {
      rewardId: "reward",
      status: "CONSUMED" as const,
      unlockedAt: now,
      consumedAt: now,
      redeemedCount: 1,
    };
    const claimed = { ...checkedIn, rewards: [consumed] };
    const syncAdapter = {
      checkIn: vi.fn(async () => ({ ok: true as const, value: { state: checkedIn, record } })),
      claimReward: vi.fn(async () => ({
        ok: true as const,
        value: { state: claimed, reward: consumed },
      })),
    };
    const client = new StampRallyClient(config, {
      storage,
      userId: "user",
      syncAdapter,
      clock: () => now,
    });

    expect((await client.checkIn("passcode", "OPEN")).ok).toBe(true);
    expect(await storage.load("rally", "user")).toEqual(checkedIn);
    expect((await client.claimReward("reward")).ok).toBe(true);
    expect(await storage.load("rally", "user")).toEqual(claimed);

    const reloaded = new StampRallyClient(config, { storage, userId: "user" });
    expect(await reloaded.init()).toMatchObject({
      records: [record],
      rewards: [{ rewardId: "reward", status: "CONSUMED" }],
    });
  });

  it.each(["checkIn", "claimReward"] as const)(
    "surfaces storage failure after a successful remote %s without enqueueing a retry",
    async (action) => {
      const storage = new InMemoryStorage();
      const offlineQueue = new OfflineQueue({ storage: new InMemoryOfflineQueueStorage() });
      const now = "2026-01-01T00:00:00.000Z";
      const record = { stampId: "passcode", acquiredAt: now };
      const checkedIn = {
        rallyId: "rally",
        userId: "user",
        records: [record],
        rewards: [{ rewardId: "reward", status: "AVAILABLE" as const, unlockedAt: now }],
        updatedAt: now,
      };
      const reward = {
        rewardId: "reward",
        status: "CONSUMED" as const,
        unlockedAt: now,
        consumedAt: now,
        redeemedCount: 1,
      };
      const syncAdapter = {
        checkIn: vi.fn(async () => ({ ok: true as const, value: { state: checkedIn, record } })),
        claimReward: vi.fn(async () => ({
          ok: true as const,
          value: { state: { ...checkedIn, rewards: [reward] }, reward },
        })),
      };
      const client = new StampRallyClient(config, {
        storage,
        offlineQueue,
        syncAdapter,
        userId: "user",
        clock: () => now,
      });
      await client.init();
      if (action === "claimReward") await client.checkIn("passcode", "OPEN");
      const previousState = client.getState();
      const previousStoredState = await storage.load("rally", "user");
      const events: ClientEvent[] = [];
      client.subscribeEvents((event) => events.push(event));
      const failure = new Error("Storage is full.");
      const save = vi.spyOn(storage, "save").mockRejectedValueOnce(failure);

      function performAction() {
        if (action === "checkIn") return client.checkIn("passcode", "OPEN");
        return client.claimReward("reward");
      }

      await expect(performAction()).rejects.toBe(failure);

      expect(syncAdapter[action]).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledOnce();
      expect(offlineQueue.operations).toEqual([]);
      expect(client.pendingCount).toBe(0);
      expect(client.getState()).toBe(previousState);
      expect(await storage.load("rally", "user")).toEqual(previousStoredState);
      expect(events).toEqual([]);
    },
  );
});
