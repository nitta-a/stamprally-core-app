# @stamprally/server v0.16.0

Web Standard `Request` / `Response` handlers for server-authoritative check-ins and reward claims.

```ts
import { StampRallyServer } from "@stamprally/server";

const server = new StampRallyServer(adminConfig, persistence, {
  authenticate: (request) => request.headers.get("x-user-id"),
});
const response = await server.handle(request);
```

`ServerPersistenceAdapter` scopes locks, reward stock, idempotency records, user state, claim records, and audit logs by `rallyId`. Its `recordUserClaim` operation receives the rally, user, reward, issued ticket number, and timestamp. Use a transactional database or equivalent Redis primitives for multi-instance production deployments.

HTTP check-in and reward-claim responses include an operation status: `ACCEPTED`,
`REJECTED_PERMANENT`, or `RETRYABLE_ERROR`. Clients can pass the response directly
to an `OfflineQueue` sender; the queue removes accepted/permanent operations and
retains retryable failures. The SQL transaction contract and all-or-nothing examples
for check-ins and claims are exported as `executeCheckInTransaction` and
`executeClaimRewardTransaction` from `src/examples/transaction.ts`. Redis adapters
can use the exported `executeRedisTransaction` helper to wrap a MULTI/EXEC batch.

Configure `anonymousPolicy: "session_scoped"` to use the UUID v4 from the
`X-Anonymous-Session-Id` header as the anonymous identity, or `"reject"` to return
HTTP 401 when no authenticated identity is present. Request validation failures use
HTTP 400 with `{ error: "VALIDATION_FAILED", details: [...] }`.

Hono can mount the handler directly because it accepts the same Web Standard request and response types.

## License

MIT
