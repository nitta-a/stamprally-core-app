# @stamprally/server

Web Standard `Request` / `Response` handlers for server-authoritative check-ins and reward claims.

## Setup

```sh
pnpm add @stamprally/core @stamprally/server
```

Provide a private admin configuration, a persistence adapter, and a function that verifies the request's session:

```ts
import { StampRallyServer } from "@stamprally/server";

const server = new StampRallyServer(adminConfig, persistence, {
  authenticate: authenticateSession,
  anonymousPolicy: "reject",
});
const response = await server.handle(request);
```

Mount `server.handle` in Hono or another Web Standard router. `authenticateSession` is supplied by the host and returns a verified user ID or `TrustedAuthContext`. For anonymous participation, use `anonymousPolicy: "session_scoped"` with the `X-Anonymous-Session-Id` header.

## Authentication and persistence

- Identity comes from verified authentication, overriding a request body's `userId`. Time and proof validation are controlled by the server.
- Implement `ServerPersistenceAdapter` with rally-scoped locks and atomic writes for user state, stock, claim records, audit logs, and idempotency. Use a transactional database or equivalent Redis primitives in production.
- When using `secondaryStockKey`, declare `supportsSecondaryStock: true` and update both inventory buckets atomically; unsupported adapters fail closed.
- `createGoogleAuthContext` verifies Google ID tokens before direct server calls. See the [Google auth guide](https://github.com/nitta-a/stamprally-core-app/blob/main/docs/GOOGLE_AUTH_SYNC.md).

## Batch sync

`syncProgress(request, authContext)` returns `{ results, currentState, syncTimestamp }`. Each operation is accepted, permanently rejected, or marked `FAILED_RETRYABLE`; independent operations continue after a failure. Keep retryable operations queued on the client.

See the [security model](https://github.com/nitta-a/stamprally-core-app/blob/main/docs/SECURITY_MODEL.md) and [transaction reference](https://github.com/nitta-a/stamprally-core-app/blob/main/docs/SYNC_AND_TRANSACTION.md) for integration requirements.

## License

MIT
