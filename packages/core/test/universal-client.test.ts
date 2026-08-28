import { describe, expect, it, vi } from "vitest";
import {
  InMemoryStorage,
  type PublicRallyConfig,
  UniversalStampRallyClient,
} from "../src/index.js";

const config: PublicRallyConfig = {
  id: "universal-client",
  version: "0.7.0",
  title: "Universal client",
  spots: [
    { id: "first", orderIndex: 0, name: "First", conditions: [{ type: "passcode" }] },
    {
      id: "custom",
      orderIndex: 1,
      name: "Custom",
      prerequisites: ["first"],
      conditions: [{ type: "custom", validatorName: "membership" }],
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
};

describe("UniversalStampRallyClient", () => {
  it("runs async custom validation and persists immutable state transitions", async () => {
    const validator = vi.fn(async ({ proofData }: { readonly proofData: unknown }) => ({
      success: proofData === "member",
    }));
    const client = new UniversalStampRallyClient(config, {
      storage: new InMemoryStorage(),
      customValidators: { membership: validator },
      clock: () => "2026-08-28T00:00:00.000Z",
    });

    await client.init();
    const blocked = await client.checkIn("custom", "member");
    expect(blocked).toMatchObject({ ok: false, error: { code: "PREREQUISITES_NOT_MET" } });
    expect((await client.checkIn("first", "1234")).ok).toBe(true);
    const checked = await client.checkIn("custom", "member");
    expect(checked).toMatchObject({ ok: true, value: { record: { stampId: "custom" } } });
    expect(validator).toHaveBeenCalledTimes(1);
    expect(client.getState()?.records).toHaveLength(2);
  });

  it("syncs a server snapshot and publishes state updates", async () => {
    const client = new UniversalStampRallyClient(config, new InMemoryStorage());
    const listener = vi.fn();
    client.subscribe(listener);
    const synced = {
      ...(await client.init()),
      records: [{ stampId: "first", acquiredAt: "2026-08-28T00:00:00.000Z" }],
    };
    await client.sync({ sync: async () => synced });
    expect(client.getState()?.records).toHaveLength(1);
    expect(listener).toHaveBeenCalled();
  });
});
