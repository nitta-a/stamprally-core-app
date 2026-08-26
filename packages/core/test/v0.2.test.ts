import { describe, expect, it } from "vitest";
import {
  createClaimTicketNumber,
  createSignedSnapshotToken,
  evaluateCheckIn,
  issueClaimTicketNumber,
  migrateRallyConfig,
  type RallyConfig,
  stripSensitiveConfig,
  validateRallyConfig,
  verifySnapshotToken,
} from "../src/index.js";

const spot = {
  id: "station",
  name: "Station",
  condition: { type: "token" as const, token: "OPEN" },
};

describe("v0.2 core APIs", () => {
  it("validates coordinates, dates, duplicate IDs, reward counts, and dependency cycles", () => {
    const result = validateRallyConfig({
      id: "rally",
      startDate: "2026-08-25T00:00:00.000Z",
      endDate: "2026-08-24T00:00:00.000Z",
      stamps: [
        {
          ...spot,
          id: "same",
          dependsOn: ["same"],
          condition: { type: "geo", latitude: 91, longitude: 0, radiusMeters: 0 },
        },
        { ...spot, id: "same" },
      ],
      rewards: [
        {
          id: "reward",
          title: "R",
          description: "R",
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 4,
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "INVALID_COORDINATES",
        "INVALID_RADIUS",
        "DUPLICATE_ID",
        "INVALID_DATE",
        "INVALID_REWARD",
        "CYCLE_DETECTED",
      ]),
    );
  });

  it("migrates legacy spots and stamps the current version", () => {
    const migrated = migrateRallyConfig({
      id: "legacy",
      spots: [{ id: "one", name: "One", token: "OK" }],
    });
    expect(migrated.version).toBe(2);
    expect(migrated.stamps[0]?.condition).toEqual({ type: "token", token: "OK" });
  });

  it("strips staff secrets and evaluates server-side check-ins", () => {
    const config: RallyConfig = {
      id: "rally",
      stamps: [spot],
      rewards: [
        {
          id: "r",
          title: "R",
          description: "R",
          type: "in_person",
          redemptionMethod: "staff_passcode",
          requiredStampCount: 1,
          staffPasscode: "secret",
        },
      ],
    };
    expect(stripSensitiveConfig(config).rewards?.[0]).not.toHaveProperty("staffPasscode");
    expect(
      evaluateCheckIn(spot, {
        verificationContext: { type: "token", token: "wrong" },
        now: "2026-08-25T00:00:00.000Z",
      }),
    ).toMatchObject({ success: false, code: "INVALID_PROOF" });
    expect(
      evaluateCheckIn(spot, {
        verificationContext: { type: "token", token: "OPEN" },
        now: "2026-08-25T00:00:00.000Z",
      }),
    ).toMatchObject({ success: true });
  });

  it("issues stable claim tickets and verifies encrypted, signed, expiring snapshots", async () => {
    expect(createClaimTicketNumber("reward", { issuedAt: "now" })).toBe(
      createClaimTicketNumber("reward", { issuedAt: "now" }),
    );
    expect(
      issueClaimTicketNumber(
        {
          id: "reward",
          title: "R",
          description: "R",
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 0,
        },
        { rewardId: "reward", status: "AVAILABLE" },
        { issuedAt: "now" },
      ).claimTicketNumber,
    ).toMatch(/^SR-/u);
    const token = await createSignedSnapshotToken(
      { rallyId: "rally", expiresAt: "2099-01-01T00:00:00.000Z" },
      "secret",
    );
    expect((await verifySnapshotToken(token, "secret")).valid).toBe(true);
    expect((await verifySnapshotToken(`${token}x`, "secret")).valid).toBe(false);
    expect(
      (await verifySnapshotToken(token, "secret", Date.parse("2100-01-01T00:00:00.000Z"))).valid,
    ).toBe(false);
  });

  it("enforces reward expiry, stock, and per-user limits without mutation", async () => {
    const base = {
      id: "reward",
      title: "Reward",
      description: "Description",
      type: "digital" as const,
      redemptionMethod: "manual_slide" as const,
      requiredStampCount: 0,
    };
    const { consumeReward } = await import("../src/index.js");
    expect(
      consumeReward({
        reward: { ...base, validUntil: "2020-01-01T00:00:00.000Z" },
        currentState: { rewardId: base.id, status: "AVAILABLE" },
        now: "2026-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({ ok: false, error: { code: "EXPIRED" } });
    expect(
      consumeReward({
        reward: { ...base, maxStock: 1 },
        currentState: { rewardId: base.id, status: "AVAILABLE", redeemedCount: 1 },
        now: "2026-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({ ok: false, error: { code: "OUT_OF_STOCK" } });
    expect(
      consumeReward({
        reward: { ...base, limitPerUser: 1 },
        currentState: { rewardId: base.id, status: "AVAILABLE", userRedemptionCount: 1 },
        now: "2026-01-01T00:00:00.000Z",
        userId: "user",
      }),
    ).toMatchObject({ ok: false, error: { code: "USER_LIMIT_REACHED" } });
  });
});
