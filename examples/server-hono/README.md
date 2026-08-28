# StampRally server (Hono)

This sample keeps `AdminRallyConfig` on the server and exposes only the result
of `toPublicConfig` to participants. `StampRallyServer` uses the same
Web Standard `Request`/`Response` primitives as Hono and delegates locks,
idempotency, state, stock, and audit persistence to `ServerPersistenceAdapter`.

See `src/server.ts` for the complete wiring shape.
