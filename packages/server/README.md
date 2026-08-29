# @stamprally/server v0.20.1

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

## Batch sync and trusted authentication

`syncProgress(request, authContext)` evaluates `operations` by their request
timestamp, preserving FIFO order for equal timestamps, and returns
`{ results, currentState, syncTimestamp }`. A permanently rejected
operation does not stop unrelated operations; a later operation depending on that
resource receives `REJECTED_PREREQUISITE_FAILED`. Retryable failures are returned
as `FAILED_RETRYABLE` so the client can retain them for the next request.

Direct server calls require a verified `TrustedAuthContext`:

```ts
const progress = await server.syncProgress(
  { rallyId: "city-tour", operations },
  { authenticatedUserId: session.userId, claims: session.claims },
);
```

The context identity is authoritative and overrides any caller-supplied `userId`.
For inventory, `stockKey` selects the primary bucket and `secondaryStockKey`
selects an additional bucket that must be decremented in the same transaction.
An adapter using a secondary key must expose `supportsSecondaryStock: true` and
persist both buckets atomically; otherwise the claim fails closed with
`SECONDARY_STOCK_UNSUPPORTED`.

Hono can mount the handler directly because it accepts the same Web Standard request and response types.

## License

MIT
