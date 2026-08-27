import { describe, expect, it } from "vitest";
import {
  type AdminRallyConfig,
  isPublicRallyConfig,
  toPublicRallyConfig,
  validateAdminRallyConfig,
  validatePublicRallyConfig,
} from "../src/index.js";

const adminConfig: AdminRallyConfig = {
  id: "city-walk",
  version: "1.0.0",
  title: { ja: "街歩き", en: "City walk" },
  spots: [
    {
      id: "gate",
      orderIndex: 0,
      name: "Gate",
      conditions: [
        { type: "qr", secretToken: "do-not-publish", qrEntryUrl: "https://example.test/gate" },
      ],
    },
    {
      id: "park",
      orderIndex: 1,
      name: "Park",
      prerequisites: ["gate"],
      conditions: [{ type: "passcode", code: "also-secret" }],
    },
  ],
  rewards: [
    {
      id: "gift",
      title: "Gift",
      type: "digital",
      redemptionMethod: "server_claim",
      requiredStampCount: 2,
      staffPasscode: "staff-secret",
      digitalContentUrl: "https://private.test/gift",
    },
  ],
};

describe("universal model security boundary", () => {
  it("projects admin secrets out of the public config", () => {
    const publicConfig = toPublicRallyConfig(adminConfig);
    expect(publicConfig.spots[0]?.conditions[0]).toEqual({
      type: "qr",
      qrEntryUrl: "https://example.test/gate",
    });
    expect(publicConfig.spots[1]?.conditions[0]).toEqual({ type: "passcode" });
    expect(publicConfig.rewards[0]).not.toHaveProperty("staffPasscode");
    expect(publicConfig.rewards[0]).not.toHaveProperty("digitalContentUrl");
    expect(isPublicRallyConfig(publicConfig)).toBe(true);
    expect(validatePublicRallyConfig(publicConfig).valid).toBe(true);
  });

  it("validates prerequisites as a DAG and rejects public secrets", () => {
    expect(validateAdminRallyConfig(adminConfig).valid).toBe(true);
    const cyclic = {
      ...adminConfig,
      spots: adminConfig.spots.map((spot) => ({
        ...spot,
        prerequisites: spot.id === "gate" ? ["park"] : ["gate"],
      })),
    };
    expect(
      validateAdminRallyConfig(cyclic).errors.some((error) => error.code === "CYCLE_DETECTED"),
    ).toBe(true);
    expect(
      validatePublicRallyConfig({ ...toPublicRallyConfig(adminConfig), secretKey: "leak" }).valid,
    ).toBe(false);
  });
});
