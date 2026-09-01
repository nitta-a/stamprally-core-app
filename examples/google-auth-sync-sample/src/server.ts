import {
  createGoogleAuthContext,
  InMemoryServerPersistenceAdapter,
  StampRallyServer,
} from "@stamprally/server";

export async function authenticateGoogle(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token === undefined || token === "") return null;
  return createGoogleAuthContext(token, { clientId: "YOUR_GOOGLE_CLIENT_ID" });
}

export function createServer() {
  return new StampRallyServer(
    {
      id: "google-demo",
      version: "1",
      title: "Google account sync demo",
      spots: [{ id: "station", orderIndex: 0, name: "Station", conditions: [] }],
      rewards: [],
    },
    new InMemoryServerPersistenceAdapter(),
    { authenticate: authenticateGoogle },
  );
}
