import { type AdminRallyConfig, toPublicConfig, type UserRallyState } from "@stamprally/core";
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
  it("atomically decrements shared and per-reward inventory", async () => {
    const sharedConfig = {
      ...config,
      inventoryMode: "shared" as const,
      inventory: { sharedStock: 1 },
    };
    const persistence = new InMemoryServerPersistenceAdapter();
    const server = new StampRallyServer(sharedConfig, persistence);
    await server.checkIn({
      rallyId: "rally",
      userId: "alice",
      spotId: "s1",
      context: { type: "passcode", code: "OPEN" },
      idempotencyKey: "shared-check-a",
    });
    await server.checkIn({
      rallyId: "rally",
      userId: "bob",
      spotId: "s1",
      context: { type: "passcode", code: "OPEN" },
      idempotencyKey: "shared-check-b",
    });
    const first = await server.claimReward({
      rallyId: "rally",
      userId: "alice",
      rewardId: "r1",
      idempotencyKey: "shared-claim-a",
    });
    const second = await server.claimReward({
      rallyId: "rally",
      userId: "bob",
      rewardId: "r1",
      idempotencyKey: "shared-claim-b",
    });
    expect(first).toMatchObject({ ok: true, inventory: { sharedRemaining: 0 } });
    expect(second).toMatchObject({ ok: false, code: "OUT_OF_STOCK" });
    expect((await server.sync("rally", "bob")).inventory?.sharedRemaining).toBe(0);
  });

  it("returns structured validation errors and scopes anonymous sessions", async () => {
    const gpsConfig = {
      ...config,
      spots: [
        {
          id: "s1",
          orderIndex: 0,
          name: "GPS",
          conditions: [{ type: "gps" as const, latitude: 0, longitude: 0, radiusMeters: 10 }],
        },
      ],
    };
    const server = new StampRallyServer(gpsConfig, new InMemoryServerPersistenceAdapter(), {
      anonymousPolicy: "session_scoped",
    });
    const invalid = await server.handle(
      new Request("https://example.test/check-in", {
        method: "POST",
        body: JSON.stringify({
          rallyId: "rally",
          spotId: "s1",
          context: { type: "gps", latitude: 91, longitude: 0 },
          idempotencyKey: "invalid",
        }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: "VALIDATION_FAILED",
      details: [{ path: "proof.latitude", code: "INVALID_RANGE" }],
    });
    const unauthorized = await server.handle(
      new Request("https://example.test/check-in", {
        method: "POST",
        body: JSON.stringify({
          rallyId: "rally",
          spotId: "s1",
          context: { type: "gps", latitude: 0, longitude: 0 },
          idempotencyKey: "no-session",
        }),
      }),
    );
    expect(unauthorized.status).toBe(401);
    const session = "123e4567-e89b-42d3-a456-426614174000";
    const authorized = await server.handle(
      new Request("https://example.test/check-in", {
        method: "POST",
        headers: { "X-Anonymous-Session-Id": session },
        body: JSON.stringify({
          rallyId: "rally",
          spotId: "s1",
          context: { type: "gps", latitude: 0, longitude: 0 },
          idempotencyKey: "session",
        }),
      }),
    );
    expect(authorized.status).toBe(200);
    expect((await authorized.json()).state.userId).toBe(session);
  });
  it("keeps check-in state, audit, and idempotency atomic", async () => {
    class FailingAuditPersistence extends InMemoryServerPersistenceAdapter {
      override async recordAuditLog(): Promise<void> {
        throw new Error("audit unavailable");
      }
    }
    const persistence = new FailingAuditPersistence();
    const server = new StampRallyServer(config, persistence);
    const result = await server.checkIn({
      rallyId: "rally",
      userId: "alice",
      spotId: "s1",
      context: { type: "passcode", code: "OPEN" },
      idempotencyKey: "check-atomic",
    });
    expect(result).toMatchObject({ ok: false, code: "PERSISTENCE_FAILED" });
    expect(await persistence.getUserState("rally", "alice")).toBeNull();
    expect(persistence.getAuditLogs()).toHaveLength(0);
    expect(
      await persistence.getIdempotentResult("rally", "check-in:rally:alice:check-atomic"),
    ).toBeNull();
  });

  it("ignores body identity and client time at the HTTP boundary", async () => {
    const persistence = new InMemoryServerPersistenceAdapter();
    const server = new StampRallyServer(config, persistence, {
      now: () => "2026-02-03T04:05:06.000Z",
    });
    const response = await server.handle(
      new Request("https://example.test/rally/check-in", {
        method: "POST",
        body: JSON.stringify({
          rallyId: "rally",
          userId: "attacker",
          spotId: "s1",
          context: { type: "passcode", code: "OPEN" },
          idempotencyKey: "http-check",
          now: "1999-01-01T00:00:00.000Z",
        }),
      }),
    );
    const body = (await response.json()) as {
      readonly ok: boolean;
      readonly state?: UserRallyState;
    };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.state?.userId).toBe("anonymous");
    expect(body.state?.records[0]?.acquiredAt).toBe("2026-02-03T04:05:06.000Z");
  });

  it("uses the authenticated identity instead of the body identity", async () => {
    const persistence = new InMemoryServerPersistenceAdapter();
    const server = new StampRallyServer(config, persistence, {
      authenticate: () => "trusted-user",
    });
    const response = await server.handle(
      new Request("https://example.test/rally/check-in", {
        method: "POST",
        body: JSON.stringify({
          rallyId: "rally",
          userId: "attacker",
          spotId: "s1",
          context: { type: "passcode", code: "OPEN" },
          idempotencyKey: "auth-check",
        }),
      }),
    );
    const body = (await response.json()) as { readonly state?: UserRallyState };
    expect(body.state?.userId).toBe("trusted-user");
  });

  it("compensates stock and user state when the success audit write fails", async () => {
    class FailingAuditPersistence extends InMemoryServerPersistenceAdapter {
      #auditCalls = 0;
      override async recordAuditLog(): Promise<void> {
        this.#auditCalls += 1;
        if (this.#auditCalls > 1) throw new Error("audit unavailable");
        await super.recordAuditLog({
          id: "check-in-audit",
          timestamp: "2026-01-01T00:00:00.000Z",
          rallyId: "rally",
          userId: "alice",
          action: "CHECK_IN",
          resourceId: "s1",
          status: "SUCCESS",
          idempotencyKey: "check-compensation",
        });
      }
    }
    const persistence = new FailingAuditPersistence({ stocks: { r1: 1 } });
    const server = new StampRallyServer(config, persistence);
    await server.checkIn({
      rallyId: "rally",
      userId: "alice",
      spotId: "s1",
      context: { type: "passcode", code: "OPEN" },
      idempotencyKey: "check-compensation",
    });
    const result = await server.claimReward({
      rallyId: "rally",
      userId: "alice",
      rewardId: "r1",
      idempotencyKey: "claim-compensation",
    });
    expect(result).toMatchObject({ ok: false, code: "PERSISTENCE_FAILED" });
    expect(await persistence.getRewardStock("rally", "r1")).toBe(1);
    expect(await persistence.getUserClaimCount("rally", "alice", "r1")).toBe(0);
    expect(persistence.getClaimRecords()).toHaveLength(0);
    expect((await persistence.getUserState("rally", "alice"))?.rewards[0]?.status).toBe(
      "AVAILABLE",
    );
  });

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
    expect(persistence.getClaimRecords()).toHaveLength(1);
    expect(persistence.getClaimRecords()[0]?.ticketNumber).toBeTruthy();
    expect(toPublicConfig(config).rewards[0]).not.toHaveProperty("digitalContentUrl");
  });

  it("keeps locks, stock, and idempotency values isolated by rally", async () => {
    const persistence = new InMemoryServerPersistenceAdapter({
      stocks: { "rally-a:r1": 1, "rally-b:r1": 2 },
    });
    expect(await persistence.acquireLock("rally-a", "same", 1_000)).toBe(true);
    expect(await persistence.acquireLock("rally-b", "same", 1_000)).toBe(true);
    expect(await persistence.decrementRewardStock("rally-a", "r1")).toEqual({
      success: true,
      remainingStock: 0,
    });
    expect(await persistence.getRewardStock("rally-b", "r1")).toBe(2);
    await persistence.saveIdempotentResult("rally-a", "same", { rally: "a" }, 1_000);
    expect(await persistence.getIdempotentResult("rally-b", "same")).toBeNull();
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
