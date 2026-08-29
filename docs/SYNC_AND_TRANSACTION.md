# Synchronization and reward transactions

Version v0.15.0 makes check-in and reward persistence atomic. A `ServerPersistenceAdapter` must
implement `executeClaimRewardTransaction`; there is no non-transactional fallback.
The adapter commits stock, user state, claim count, audit log, and idempotency data
as one unit and rolls all of them back if any write fails.

## Adapter example

```ts
async executeClaimRewardTransaction(params, mutation) {
  return database.transaction(async (transaction) => {
    const current = await readClaimContext(transaction, params);
    if (current.stock !== null && current.stock <= 0)
      return { success: false, error: "OUT_OF_STOCK" };
    const next = mutation(current);
    if (next.error !== undefined) {
      await writeAudit(transaction, next.auditLog);
      await writeIdempotency(transaction, params.idempotencyKey, next.result);
      return { success: false, error: next.error };
    }
    await writeStock(transaction, params, next.nextStock);
    await writeUserState(transaction, params, next.nextUserState);
    await writeClaimCountAndRecord(transaction, params, next.nextUserState);
    await writeAudit(transaction, next.auditLog);
    await writeIdempotency(transaction, params.idempotencyKey, next.result);
    return { success: true };
  });
}
```

The exact transaction primitive is storage-specific: PostgreSQL should use a
database transaction and row locks, while Redis should use a Lua script or an
equivalent atomic workflow. Do not implement the method as a sequence of
independent network writes.

## Offline conflict policy

`OfflineQueue` uses `authoritative_replay` as its only conflict policy. The server
snapshot is the immutable baseline, and the durable operation log is replayed on
top of it. Rejected operations are skipped while independent pending operations
remain optimistic.

```mermaid
sequenceDiagram
  participant C as Client
  participant Q as OfflineQueue
  participant S as Server
  participant D as Durable storage
  C->>Q: enqueue operation with idempotency key
  Q->>S: replay operation after reconnect
  alt accepted
    S-->>Q: result + state
    Q->>D: save state
  else rejected
    S-->>Q: typed error
    Q->>Q: discard operation and emit error event
  else conflict
    S-->>Q: local state + server state
    Q->>Q: replay pending operations authoritatively
    Q->>D: save resolved state
  end
```

Each replay response is classified as `ACCEPTED`, `REJECTED_PERMANENT`, or
`RETRYABLE_ERROR`. Accepted and permanent responses are removed after the response
is durably handled; permanent reasons are emitted as client error events.
Transport or explicitly retryable failures remain queued for `retrySync`.
`useStampRally` observes the client state and error events, so accepted and replayed
results are visible immediately.

The queue marks every persisted operation `PENDING`, `IN_FLIGHT`, `ACCEPTED`, or
`REJECTED`. Web Locks is used when available; the storage lock is the fallback.
`retryOptions` supports bounded retries with `maxRetries`, `initialIntervalMs`, and
`backoffMultiplier`.

Anonymous clients receive a browser-persistent UUID v4 `anonymousSessionId`, which
is used as the state and queue scope and should be sent as the
`X-Anonymous-Session-Id` request header. The default queue key is
`stamprally:queue:<rallyId>:<userId-or-anonymous>`. A
queue can switch users with `switchUser(userId)`; every operation is checked against
the active rally/user scope. Pass an explicit `key` only when an application owns
an equivalent isolation scheme.

## Custom adapter checklist

Implement `OfflineQueueStorage.load` and `save` as durable operations, preserving
the order of the array. A sync sender should return the operation result wrapped as
`{ status: "ACCEPTED", result }`, return `{ status: "REJECTED_PERMANENT", error }`
for a condition that cannot succeed later, and use `{ status: "RETRYABLE_ERROR",
error }` for a temporary failure. Never include proof secrets in rejection metadata.

For reward claims, `packages/server/src/examples/transaction.ts` contains a SQL
adapter contract. Read stock, claim count, and user state with row locks, then write
stock, state, claim record, audit, and idempotency data through one transaction.

## Metadata security boundary

`publicMetadata` is safe to include in `toPublicConfig` and may be sent to browsers.
`serverMetadata` is never published and can contain internal IDs, moderation notes,
or integration details. Treat all client-provided proof data and public metadata as
untrusted input; validate it on the server and do not copy secrets into audit metadata.
