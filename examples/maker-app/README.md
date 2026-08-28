# Maker app

Use `AdminRallyEditor` from `@stamprally/admin-ui` to edit the universal
`AdminRallyConfig`. Publish only `toPublicConfig(config)`; it removes
verification secrets and gated digital content before the configuration reaches
participants. The editor supports localized spot and reward fields, condition
editing, reordering, deletion, and JSON import with `safeParseAdminConfig`
field-level errors.
