# Google auth sync sample

This minimal example shows the integration boundary between Google Identity Services,
`@stamprally/react`, and `@stamprally/server`. Configure the GIS client ID and implement the
three `/api` endpoints with your database before using it in production.

The browser never verifies or stores a Google signing key. It passes the GIS credential to the
host API, which calls `createGoogleAuthContext` and uses the returned `TrustedAuthContext` for
server-authoritative persistence.
