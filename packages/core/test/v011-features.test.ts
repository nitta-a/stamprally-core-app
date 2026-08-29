import { describe, expect, it } from "vitest";
import {
  getLegacyQueueCapability,
  InMemoryOfflineQueueStorage,
  OfflineQueue,
  sanitizeAdminConfig,
  validatePublicConfigSafety,
} from "../src/index.js";

describe("v0.11 public configuration contract", () => {
  it("sanitizes private values and applies a custom allow-list", () => {
    const publicConfig = sanitizeAdminConfig(
      {
        id: "r",
        version: "1",
        title: "Rally",
        staffPasscode: "staff",
        serverMetadata: { internal: true },
        metadata: { publicValue: "ok", internal: "remove" },
        spots: [
          {
            id: "s",
            orderIndex: 0,
            name: "Spot",
            conditions: [{ type: "qr", secretToken: "secret", qrEntryUrl: "/entry" }],
          },
        ],
        rewards: [
          {
            id: "reward",
            title: "Reward",
            type: "digital",
            redemptionMethod: "server_claim",
            requiredStampCount: 1,
            digitalContentUrl: "https://private.invalid",
          },
        ],
      },
      (key) => key !== "internal",
    );
    expect(publicConfig).not.toHaveProperty("staffPasscode");
    expect(publicConfig).not.toHaveProperty("serverMetadata");
    expect(publicConfig.spots[0]?.conditions[0]).toEqual({ type: "qr", qrEntryUrl: "/entry" });
    expect(publicConfig.metadata).toEqual({ publicValue: "ok" });
    expect(validatePublicConfigSafety(publicConfig)).toEqual({ safe: true, leakedKeys: [] });
  });
});

describe("OfflineQueue", () => {
  it("exposes object capabilities and legacy persistence access", async () => {
    const persistent = new OfflineQueue({
      storage: new InMemoryOfflineQueueStorage(),
      key: "queue",
    });
    expect(persistent.queueCapability).toMatchObject({
      mode: "persistent",
      isPersistent: true,
      legacy: "persistent",
    });
    expect(getLegacyQueueCapability(persistent.queueCapability)).toBe("persistent");

    const volatile = new OfflineQueue({
      storage: {
        load: async () => {
          throw new Error("storage unavailable");
        },
        save: async () => undefined,
      },
      key: "queue",
    });
    await volatile.initialize();
    expect(volatile.queueCapability).toMatchObject({
      mode: "volatile_memory",
      isPersistent: false,
      legacy: "volatile",
    });
    expect(getLegacyQueueCapability(volatile.queueCapability)).toBe("volatile");
  });

  it("persists and drains operations in order", async () => {
    const storage = new InMemoryOfflineQueueStorage();
    const first = new OfflineQueue({ storage, key: "queue" });
    const request = {
      rallyId: "r",
      userId: "u",
      spotId: "s",
      proofData: "proof",
      idempotencyKey: "one",
      now: "2026-01-01T00:00:00.000Z",
      state: { rallyId: "r", userId: "u", records: [], rewards: [], updatedAt: "" },
    };
    await first.enqueueCheckIn(request);
    const restored = new OfflineQueue({ storage, key: "queue" });
    await restored.initialize();
    expect(restored.pendingCount).toBe(1);
    const seen: string[] = [];
    await restored.retrySync(async (operation) => {
      seen.push(operation.request.idempotencyKey);
      return {
        ok: true,
        value: { state: request.state, record: { stampId: "s", acquiredAt: request.now } },
      };
    });
    expect(seen).toEqual(["one"]);
    expect(restored.pendingCount).toBe(0);
    expect(restored.syncState).toBe("idle");
  });

  it("disables automatic multi-tab synchronization without Web Locks", async () => {
    const storage = new InMemoryOfflineQueueStorage();
    const warnings: string[] = [];
    const queue = new OfflineQueue({ storage, key: "shared" });
    queue.setCapabilityWarningListener((warning) => warnings.push(warning.message));
    await queue.enqueueCheckIn({
      rallyId: "r",
      userId: "u",
      spotId: "s",
      proofData: "proof",
      idempotencyKey: "shared-op",
      now: "",
      state: { rallyId: "r", userId: "u", records: [], rewards: [], updatedAt: "" },
    });
    expect(queue.queueCapability.multiTabSync).toBe("disabled_unsafe_environment");
    await queue.initialize();
    expect(warnings).toContain(
      "Web Locks is unavailable; automatic cross-tab synchronization is disabled. Sync must be triggered by the foreground tab.",
    );
  });
});
