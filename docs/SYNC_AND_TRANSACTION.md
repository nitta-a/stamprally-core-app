# Synchronization and reward transactions

Version 0.12.0 makes reward persistence atomic. A `ServerPersistenceAdapter` must
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

`OfflineQueue` supports `server_wins` and `merge`. Merge keeps the server state as
the base, adds locally acquired stamps that are absent on the server, preserves
server reward values, and gives a consumed reward priority if either side consumed it.

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
    Q->>Q: apply merge or server_wins
    Q->>D: save resolved state
  end
```

Rejected operations are removed after the server response is durably handled;
transport failures remain queued for retry. `useStampRally` observes the client
state and error events, so accepted and merged results are visible immediately.

## Metadata security boundary

`publicMetadata` is safe to include in `toPublicConfig` and may be sent to browsers.
`serverMetadata` is never published and can contain internal IDs, moderation notes,
or integration details. Treat all client-provided proof data and public metadata as
untrusted input; validate it on the server and do not copy secrets into audit metadata.
