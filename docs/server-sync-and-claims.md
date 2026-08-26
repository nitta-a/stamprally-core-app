# Server synchronization and reward claims

The server is authoritative when a device reconnects. The client submits its
offline check-in queue with idempotency keys; the server validates each proof
against the private rally configuration, ignores duplicate keys, and returns
the latest user state.

```mermaid
sequenceDiagram
  participant C as Client
  participant S as StampRallyServer
  participant DB as ServerStorageAdapter
  C->>S: POST /api/sync (offline queue)
  S->>DB: load user state
  loop queued check-ins
    S->>S: validate condition and idempotency key
    S->>DB: save state and audit result
  end
  S-->>C: authoritative state
  C->>S: POST /api/claim-reward
  S->>DB: check user claims and atomic stock decrement
  S->>DB: save ticket and audit log
  S-->>C: claimTicketNumber
```

Reward claims are serialized per server instance and must be backed by an
atomic adapter operation across instances. A failed stock decrement never
produces a successful claim or success audit record.

Recovery tokens use HMAC-SHA256 signatures and optionally AES-GCM encryption.
They should have an expiry (`exp`) for operational recovery workflows.
