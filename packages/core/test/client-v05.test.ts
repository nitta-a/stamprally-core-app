import { describe, expect, it } from "vitest";
import { InMemoryStorage, type RallyConfig, StampRallyClient } from "../src/index.js";

const initial: RallyConfig = {
  id: "runtime-config",
  stamps: [
    { id: "keep", name: "Keep", condition: { type: "instant" } },
    { id: "remove", name: "Remove", condition: { type: "instant" } },
  ],
};

describe("v0.5 client APIs", () => {
  it("updates config and removes records for deleted spots", async () => {
    const client = new StampRallyClient(initial, new InMemoryStorage());
    await client.init();
    await client.acquire("remove", { type: "instant" });
    const keep = initial.stamps[0];
    expect(keep).toBeDefined();
    const next = await client.updateConfig({
      ...initial,
      stamps: keep === undefined ? [] : [keep],
    });
    expect(next.records).toEqual([]);
    expect(client.getConfig().stamps).toHaveLength(1);
  });

  it("publishes typed check-in and error events", async () => {
    const client = new StampRallyClient(initial, new InMemoryStorage());
    const events: string[] = [];
    client.subscribe((event) => events.push(event.type), { events: true });
    await client.init();
    await client.acquire("keep", { type: "instant" });
    await client.acquire("missing", { type: "instant" });
    expect(events).toEqual(["checkIn", "error"]);
  });
});
