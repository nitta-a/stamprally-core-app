import type { AdminRallyConfig } from "@stamprally/core";
import { InMemoryServerPersistenceAdapter, UniversalRallyServer } from "@stamprally/server";
import { Hono } from "hono";

const adminConfig: AdminRallyConfig = {
  id: "city-walk",
  version: "1.0.0",
  title: "City walk",
  spots: [],
  rewards: [],
};
const service = new UniversalRallyServer(adminConfig, new InMemoryServerPersistenceAdapter());
const app = new Hono();

app.post("/api/check-in", async (context) => {
  const body = await context.req.json();
  const result = await service.checkIn(body);
  return context.json(result, result.ok ? 200 : 422);
});

export default app;
