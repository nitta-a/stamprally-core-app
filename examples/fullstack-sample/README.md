# Full-stack sample

This sample demonstrates the single model flow:

1. `AdminRallyEditor` creates an `AdminRallyConfig`.
2. `toPublicConfig` removes verification secrets and server-only metadata.
3. `RallyViewer` renders the public configuration and submits proofs.
4. `StampRallyServer` verifies the request and performs an atomic reward claim.

The participant state is scoped by `rallyId` and `userId`, with anonymous users
stored under the `anonymous` scope.
