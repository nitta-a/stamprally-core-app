import { type AdminRallyConfig, toPublicConfig } from "@stamprally/core";
import { describe, expect, it } from "vitest";
import { InMemoryServerPersistenceAdapter, StampRallyServer } from "../src/index.js";

const config: AdminRallyConfig = {
  id: "rally",
  version: "1",
  title: "Rally",
  spots: [
    { id: "s1", orderIndex: 0, name: "Spot", conditions: [{ type: "passcode", code: "OPEN" }] },
  ],
  rewards: [
    {
      id: "r1",
      title: "Reward",
      type: "digital",
      redemptionMethod: "server_claim",
      requiredStampCount: 1,
      stockLimit: 1,
      userClaimLimit: 1,
      digitalContentUrl: "https://private.invalid",
    },
  ],
};
describe("StampRallyServer", () => {
  it("claims one stocked reward atomically and is idempotent", async () => {
    const persistence = new InMemoryServerPersistenceAdapter({ stocks: { r1: 1 } });
    const server = new StampRallyServer(config, persistence);
    const check = await server.checkIn({
      rallyId: "rally",
      userId: "alice",
      spotId: "s1",
      context: { type: "passcode", code: "OPEN" },
      idempotencyKey: "check",
    });
    expect(check.ok).toBe(true);
    const request = { rallyId: "rally", userId: "alice", rewardId: "r1", idempotencyKey: "claim" };
    const first = await server.claimReward(request);
    const second = await server.claimReward(request);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(await persistence.getUserClaimCount("rally", "alice", "r1")).toBe(1);
    expect(toPublicConfig(config).rewards[0]).not.toHaveProperty("digitalContentUrl");
  });

  it("serializes concurrent claims against one stock unit", async () => {
    const persistence = new InMemoryServerPersistenceAdapter({ stocks: { r1: 1 } });
    const server = new StampRallyServer(config, persistence);
    await server.checkIn({
      rallyId: "rally",
      userId: "alice",
      spotId: "s1",
      context: { type: "passcode", code: "OPEN" },
      idempotencyKey: "check-concurrent",
    });
    await server.checkIn({
      rallyId: "rally",
      userId: "bob",
      spotId: "s1",
      context: { type: "passcode", code: "OPEN" },
      idempotencyKey: "check-concurrent-b",
    });
    const [first, second] = await Promise.all([
      server.claimReward({
        rallyId: "rally",
        userId: "alice",
        rewardId: "r1",
        idempotencyKey: "claim-a",
      }),
      server.claimReward({
        rallyId: "rally",
        userId: "bob",
        rewardId: "r1",
        idempotencyKey: "claim-b",
      }),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(
      [first, second].some(
        (result) => !result.ok && (result.code === "OUT_OF_STOCK" || result.code === "CONFLICT"),
      ),
    ).toBe(true);
  });
});
