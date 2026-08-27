import type { AdminRallyConfig } from "@stamprally/core";
import { describe, expect, it } from "vitest";
import { InMemoryServerPersistenceAdapter, UniversalRallyServer } from "../src/index.js";

describe("InMemoryServerPersistenceAdapter", () => {
  it("provides lock, idempotency, stock, state, and audit primitives", async () => {
    const adapter = new InMemoryServerPersistenceAdapter({ stocks: { gift: 1 } });
    expect(await adapter.acquireLock("reward:gift", 1000)).toBe(true);
    expect(await adapter.acquireLock("reward:gift", 1000)).toBe(false);
    await adapter.releaseLock("reward:gift");
    expect(await adapter.acquireLock("reward:gift", 1000)).toBe(true);

    expect(await adapter.decrementRewardStock("gift")).toEqual({
      success: true,
      remainingStock: 0,
    });
    expect(await adapter.decrementRewardStock("gift")).toEqual({
      success: false,
      remainingStock: 0,
    });
    await adapter.saveIdempotentResult("request-1", { ok: true }, 1000);
    expect(await adapter.getIdempotentResult("request-1")).toEqual({ ok: true });
  });

  it("serializes universal-model check-ins and keeps them idempotent", async () => {
    const config: AdminRallyConfig = {
      id: "rally",
      version: "1.0.0",
      title: "Rally",
      spots: [
        {
          id: "gate",
          orderIndex: 0,
          name: "Gate",
          conditions: [{ type: "passcode", code: "open" }],
        },
        {
          id: "finish",
          orderIndex: 1,
          name: "Finish",
          prerequisites: ["gate"],
          conditions: [{ type: "custom", validatorName: "always" }],
        },
      ],
      rewards: [],
    };
    const adapter = new InMemoryServerPersistenceAdapter();
    const server = new UniversalRallyServer(config, adapter, {
      now: () => "2026-08-28T00:00:00.000Z",
      customValidators: { always: () => true },
    });
    const blocked = await server.checkIn({
      rallyId: "rally",
      userId: "user",
      spotId: "finish",
      context: { type: "custom", value: null },
      idempotencyKey: "finish-1",
    });
    expect(blocked).toMatchObject({ ok: false, code: "PREREQUISITES_NOT_MET" });
    const request = {
      rallyId: "rally",
      userId: "user",
      spotId: "gate",
      context: { type: "passcode" as const, code: "open" },
      idempotencyKey: "gate-1",
    };
    const first = await server.checkIn(request);
    const second = await server.checkIn(request);
    expect(first).toEqual(second);
    expect(first.ok && first.state.records).toHaveLength(1);
  });
});
