# @stamprally/server

Web Standard `Request` / `Response` handlers for server-authoritative check-ins and reward claims.

```ts
import { StampRallyServer } from "@stamprally/server";

const server = new StampRallyServer(adminConfig, persistence, {
  authenticate: (request) => request.headers.get("x-user-id"),
});
const response = await server.handle(request);
```

`ServerPersistenceAdapter` scopes locks, reward stock, idempotency records, user state, claim records, and audit logs by `rallyId`. Its `recordUserClaim` operation receives the rally, user, reward, issued ticket number, and timestamp. Use a transactional database or equivalent Redis primitives for multi-instance production deployments.

Hono can mount the handler directly because it accepts the same Web Standard request and response types.

## License

MIT
