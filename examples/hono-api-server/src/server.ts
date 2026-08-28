import type { AdminRallyConfig } from "@stamprally/core";
import { InMemoryServerPersistenceAdapter, UniversalRallyServer } from "@stamprally/server";
import { Hono } from "hono";
import { jwtVerify } from "jose";

const runtimeEnv = (
  globalThis as typeof globalThis & {
    readonly process?: { readonly env?: Readonly<Record<string, string | undefined>> };
  }
).process?.env;
const jwtSecret = new TextEncoder().encode(
  runtimeEnv?.RALLY_JWT_SECRET ?? "development-only-secret",
);
const config: AdminRallyConfig = {
  id: "city-walk",
  version: "0.7.0",
  title: "City walk",
  spots: [],
  rewards: [],
};

const server = new UniversalRallyServer(config, new InMemoryServerPersistenceAdapter(), {
  authenticate: async (request) => {
    const authorization = request.headers.get("authorization");
    if (authorization?.startsWith("Bearer ") !== true) return null;
    try {
      const verified = await jwtVerify(authorization.slice("Bearer ".length), jwtSecret);
      return typeof verified.payload.sub === "string" ? verified.payload.sub : null;
    } catch {
      return null;
    }
  },
});

const app = new Hono();
app.post("/api/check-in", async (context) =>
  toHonoResponse(context, await server.handleCheckIn(context.req.raw)),
);
app.post("/api/claim-reward", async (context) =>
  toHonoResponse(context, await server.handleClaimReward(context.req.raw)),
);
app.post("/api/sync", async (context) =>
  toHonoResponse(context, await server.handleSync(context.req.raw)),
);

function toHonoResponse(
  context: { newResponse: (body?: BodyInit | null, init?: ResponseInit) => Response },
  response: Response,
): Response {
  return context.newResponse(response.body, response);
}

export default app;
