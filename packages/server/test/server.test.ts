import { describe, expect, it } from "vitest";
import type { AdminRallyConfig } from "../src/index.js";
import { InMemoryServerStorage, StampRallyServer } from "../src/index.js";

const config: AdminRallyConfig = {
  id: "demo",
  secretKey: "server-secret",
  stamps: [{ id: "gate", name: "Gate", condition: { type: "instant" } }],
  rewards: [
    {
      id: "gift",
      title: "Gift",
      description: "A gift",
      type: "in_person",
      redemptionMethod: "server_claim",
      requiredStampCount: 1,
      stockLimit: 1,
      userClaimLimit: 1,
    },
  ],
};

function post(path: string, body: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("StampRallyServer", () => {
  it("verifies check-ins, issues proofs, and atomically claims stock", async () => {
    const storage = new InMemoryServerStorage({ stocks: { gift: 1 } });
    const server = new StampRallyServer(config, storage);
    const checkIn = await server.handle(
      post("/api/check-in", {
        userId: "user-1",
        spotId: "gate",
        claimMethod: "instant",
        idempotencyKey: "check-1",
      }),
    );
    expect(checkIn.status).toBe(200);
    const checkInBody = (await checkIn.json()) as { readonly proof: { readonly token: string } };
    expect(checkInBody.proof.token.startsWith("sr3.e.")).toBe(true);

    const claim = await server.handle(
      post("/api/claim-reward", {
        userId: "user-1",
        rewardId: "gift",
        idempotencyKey: "claim-1",
      }),
    );
    expect(claim.status).toBe(200);
    expect((await claim.json()) as { claimTicketNumber: string }).toHaveProperty(
      "claimTicketNumber",
    );

    const outOfStock = await server.handle(
      post("/api/claim-reward", {
        userId: "user-2",
        rewardId: "gift",
        idempotencyKey: "claim-2",
      }),
    );
    expect(outOfStock.status).toBe(422);
    expect(storage.getAuditLogs()).toHaveLength(3);
  });

  it("replays idempotent requests", async () => {
    const server = new StampRallyServer(config, new InMemoryServerStorage());
    const body = {
      userId: "user-1",
      spotId: "gate",
      claimMethod: "instant",
      idempotencyKey: "same",
    };
    const first = await server.handle(post("/api/check-in", body));
    const second = await server.handle(post("/api/check-in", body));
    expect(await first.text()).toBe(await second.text());
  });
});
