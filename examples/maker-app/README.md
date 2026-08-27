# Maker app

Use `AdminRallyEditor` from `@stamprally/admin-ui` to edit the universal
`AdminRallyConfig`. Publish only `toPublicRallyConfig(config)`; it removes
verification secrets and gated digital content before the configuration reaches
participants.
