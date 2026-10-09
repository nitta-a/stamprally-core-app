import type { AdminRallyConfig } from "@stamprally/core";
import { describe, expect, it } from "vitest";
import { createDemoClient } from "../src/createDemoClient.js";

const config: AdminRallyConfig = {
  id: "test-walk",
  version: "1",
  title: "テスト街歩き",
  completion: { condition: { type: "stamp_count", count: 2 } },
  spots: [
    {
      id: "welcome",
      orderIndex: 0,
      name: "案内所",
      conditions: [{ type: "passcode", code: "OPEN" }],
    },
    {
      id: "park",
      orderIndex: 1,
      name: "公園",
      conditions: [{ type: "passcode", code: "RIVER" }],
      prerequisites: ["welcome"],
    },
  ],
  rewards: [
    {
      id: "card",
      title: "記念カード",
      type: "digital",
      redemptionMethod: "view_only",
      requiredStampCount: 2,
    },
  ],
};

describe("demo client", () => {
  it("rejects an incorrect code without changing progress and accepts the configured code", async () => {
    const client = createDemoClient(config);
    const initial = await client.init();
    const rejected = await client.checkIn("welcome", "WRONG");
    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_PROOF",
        message: "合言葉を確認して、もう一度お試しください。",
      },
    });
    expect(client.getState()).toEqual(initial);
    const accepted = await client.checkIn("welcome", "OPEN");
    expect(accepted.ok).toBe(true);
    expect(client.getState()?.records).toEqual([
      { stampId: "welcome", acquiredAt: expect.any(String) },
    ]);
    expect(client.getConfig().spots[0]?.conditions).toEqual([{ type: "passcode" }]);
  });

  it("keeps prerequisites and duplicate check-ins intact and unlocks a view-only reward", async () => {
    const client = createDemoClient(config);
    const locked = await client.checkIn("park", "RIVER");
    expect(locked).toMatchObject({ ok: false, error: { code: "PREREQUISITES_NOT_MET" } });
    await client.checkIn("welcome", "OPEN");
    const duplicate = await client.checkIn("welcome", "OPEN");
    expect(duplicate).toMatchObject({ ok: false, error: { code: "STAMP_ALREADY_ACQUIRED" } });
    await client.checkIn("park", { type: "passcode", code: "RIVER" });
    expect(client.getState()?.rewards).toEqual([
      { rewardId: "card", status: "AVAILABLE", unlockedAt: expect.any(String) },
    ]);
    await client.claimReward("card");
    expect(client.getState()?.rewards[0]?.status).toBe("AVAILABLE");
    expect(client.getState()?.records).toHaveLength(2);
  });

  it.each([
    [
      { type: "qr", secretToken: "QR-TOKEN" },
      { type: "qr", token: "QR-TOKEN" },
      { type: "qr", token: "WRONG" },
    ],
    [
      { type: "nfc", tagId: "NFC-TAG" },
      { type: "nfc", tagId: "NFC-TAG" },
      { type: "nfc", tagId: "WRONG" },
    ],
    [
      { type: "gps", latitude: 35.681236, longitude: 139.767125, radiusMeters: 100 },
      { type: "gps", latitude: 35.681236, longitude: 139.767125 },
      { type: "gps", latitude: Number.NaN, longitude: 139.767125 },
    ],
  ] satisfies ReadonlyArray<
    readonly [AdminRallyConfig["spots"][number]["conditions"][number], unknown, unknown]
  >)(
    "verifies browser detector proof %j with the Core rules",
    async (condition, validProof, invalidProof) => {
      const detectorConfig: AdminRallyConfig = {
        ...config,
        spots: [{ id: "detector", orderIndex: 0, name: "センサー", conditions: [condition] }],
      };
      const client = createDemoClient(detectorConfig);
      expect(await client.checkIn("detector", invalidProof)).toMatchObject({
        ok: false,
        error: { code: "INVALID_PROOF" },
      });
      expect(await client.checkIn("detector", validProof)).toMatchObject({ ok: true });
    },
  );
});
