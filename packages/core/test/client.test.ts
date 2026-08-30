import { describe, expect, it, vi } from "vitest";
import {
  type AdminRallyConfig,
  InMemoryStorage,
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
});
