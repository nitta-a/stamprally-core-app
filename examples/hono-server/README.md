# Hono server integration

`StampRallyServer.handle(request)` accepts the same Web Standard request used
by Hono. A route can be mounted without a framework-specific adapter:

```ts
app.all("/api/*", async (c) => {
  const response = await server.handle(c.req.raw);
  return new Response(response.body, response);
});
```

The application should authenticate the request before the handler or provide
`AdminRallyConfig.authenticate`. Store rally state, audit logs, and reward
stock in Redis or a transactional database for multi-instance deployments.
