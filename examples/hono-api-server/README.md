# Hono + JWT API

This example shows the intended security boundary for a Web Standard server.
JWT middleware verifies the token and returns its `sub` claim to
`StampRallyServer`; authenticated identities are used instead of request-body `userId` values.

Install `hono` and `jose` in the host application, then adapt the persistence
implementation to Redis or a transactional database before production use.
