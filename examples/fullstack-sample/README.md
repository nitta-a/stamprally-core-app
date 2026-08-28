# Full-stack sample

This sample demonstrates the single canonical-model flow:

1. `AdminRallyEditor` creates an `AdminRallyConfig`.
2. `toPublicConfig` removes verification secrets and server-only metadata.
3. `RallyViewer` renders the public configuration and submits proofs.
4. `StampRallyServer` verifies the request and performs an atomic reward claim.

The participant state and server persistence are scoped by `rallyId` and `userId`.
For a runnable browser entry point, initialize a client from `toPublicConfig` and
pass it to `RallyViewer`:

```tsx
const publicConfig = toPublicConfig(adminConfig);
const client = new StampRallyClient(publicConfig, { userId: null });
await client.init();
return <RallyViewer config={publicConfig} client={client} locale="en" />;
```
