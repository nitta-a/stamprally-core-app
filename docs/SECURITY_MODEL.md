# Server security model

The server is authoritative for identity, time, verification, and idempotency.

## Identity

When `ServerOptions.authenticate` is configured, the returned authenticated user ID is
the only user identity used for state, audit, locks, and idempotency. A `userId` in the
request body is ignored. When authentication is not configured, HTTP requests use the
explicit safe default user `anonymous`; the body cannot select another user. Production
deployments should configure authentication before accepting user-specific data.

## Time

Request `now` values are accepted only as an input-shape compatibility field and are
never used for decisions, state timestamps, audit timestamps, or idempotency expiry.
The server clock (or the server-side `ServerOptions.now` test/hosting adapter) supplies
the authoritative time.

## Proof data

Request proof data is validated and evaluated on the server. It is not copied into
user progress metadata or audit logs. Custom validators receive it only for the
duration of validation.

## Idempotency and atomicity

Idempotency keys are scoped by rally, operation, and authenticated user. A check-in
transaction commits the user state, audit log, and idempotency result together. A
reward transaction additionally commits stock and claim records together. Persistence
adapters must provide equivalent database transaction semantics and must roll back all
writes if any part fails.
