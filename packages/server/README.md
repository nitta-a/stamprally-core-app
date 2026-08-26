# @stamprally/server

Web Standard `Request` / `Response` handlers for server-authoritative stamp rally
check-ins, reward claims, and offline synchronization.

```ts
import { StampRallyServer } from "@stamprally/server";

const server = new StampRallyServer(
  {
    id: "spring-rally",
    secretKey: process.env.RALLY_SECRET ?? "replace-me",
    stamps: [{ id: "gate", name: { en: "Gate" }, condition: { type: "instant" } }],
  },
  storage,
);

const response = await server.handle(request);
```

Provide a Redis-backed `ServerStorageAdapter` in production. Its
`decrementRewardStock` implementation should use a single atomic Redis
operation (for example, a Lua script or `DECR` guarded by a non-negative check).
The built-in `InMemoryServerStorage` is intended for tests and local demos.

If authentication is already handled by the host application, use
`authenticate` to return the authenticated user ID. The handler rejects bodies
that attempt to act for a different user.
