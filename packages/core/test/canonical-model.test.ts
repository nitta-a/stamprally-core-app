import { describe, expect, it } from "vitest";
import {
  type AdminRallyConfig,
  assertPublicConfig,
  InMemoryStorage,
  StampRallyClient,
  toPublicConfig,
} from "../src/index.js";

const admin: AdminRallyConfig = {
  id: "rally-1",
  version: "1",
  title: { ja: "ラリー", en: "Rally" },
  staffPasscode: "staff-secret",
  serverMetadata: { internal: true },
  spots: [
    { id: "spot-1", orderIndex: 0, name: "One", conditions: [{ type: "passcode", code: "OPEN" }] },
  ],
  rewards: [],
};

describe("canonical public model", () => {
  it("removes private fields and guards the boundary", () => {
    const config = toPublicConfig(admin);
    expect(config.spots[0]?.conditions).toEqual([{ type: "passcode" }]);
    expect(config).not.toHaveProperty("staffPasscode");
    expect(config).not.toHaveProperty("serverMetadata");
    expect(() => assertPublicConfig(config)).not.toThrow();
    expect(() => assertPublicConfig({ ...config, secretToken: "leak" })).toThrow();
  });

  it("keeps anonymous and authenticated progress isolated", async () => {
    const storage = new InMemoryStorage();
    const config = toPublicConfig(admin);
    const client = new StampRallyClient(config, { storage, userId: "alice" });
    expect((await client.checkIn("spot-1", "OPEN", { now: "2026-01-01T00:00:00.000Z" })).ok).toBe(
      true,
    );
    await client.switchUser("bob");
    expect((await client.initialize()).records).toHaveLength(0);
    await client.switchUser("alice");
    expect((await client.initialize()).records).toHaveLength(1);
    expect(await client.getUserState(config.id, "alice")).not.toBeNull();
    expect(await client.getUserState(config.id, "bob")).toBeNull();
  });
});
