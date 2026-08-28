import type { AdminRallyConfig } from "@stamprally/core";
import { describe, expect, it } from "vitest";
import { InMemoryServerPersistenceAdapter, UniversalRallyServer } from "../src/index.js";

const config: AdminRallyConfig = {
  id: "universal-api",
  version: "0.7.0",
  title: "API",
  spots: [
    { id: "gate", orderIndex: 0, name: "Gate", conditions: [{ type: "passcode", code: "open" }] },
  ],
  rewards: [],
};

function post(path: string, body: unknown, token?: string): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

describe("UniversalRallyServer HTTP handlers", () => {
  it("uses authenticated identity instead of a submitted userId", async () => {
    const persistence = new InMemoryServerPersistenceAdapter();
    const server = new UniversalRallyServer(config, persistence, {
      authenticate: () => "auth-user",
    });
    const response = await server.handleCheckIn(
      post(
        "/api/check-in",
        {
          rallyId: config.id,
          userId: "attacker",
          spotId: "gate",
          context: { type: "passcode", code: "open" },
          idempotencyKey: "one",
        },
        "valid",
      ),
    );
    expect(response.status).toBe(200);
    expect(await persistence.getUserState(config.id, "auth-user")).not.toBeNull();
    expect(await persistence.getUserState(config.id, "attacker")).toBeNull();
  });

  it("routes sync and returns a Web Standard JSON response", async () => {
    const server = new UniversalRallyServer(config, new InMemoryServerPersistenceAdapter(), {
      authenticate: () => "user",
    });
    const response = await server.handle(
      post("/api/sync", { rallyId: config.id, userId: "ignored" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, state: { rallyId: config.id } });
  });
});
