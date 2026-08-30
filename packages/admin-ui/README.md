# @stamprally/admin-ui v0.24.0

Accessible authoring forms and a headless editor for rally management screens.

## Structured editor

```tsx
import { AdminRallyEditor } from "@stamprally/admin-ui";
import "@stamprally/admin-ui/styles.css";

<AdminRallyEditor config={config} locale="en" onChange={setConfig} />
```

The editor provides structured fields for localized rally and reward content,
reward limits and expiry, all condition types, theme properties, and separate
public/server metadata sections. `JsonConfigIO` remains available for import/export
and validation workflows, but normal editing does not require JSON.

## Headless API

`useAdminRallyEditor(initialConfig)` returns immutable editing actions:

```tsx
const editor = useAdminRallyEditor(config, { onChange: saveDraft });
editor.addSpot({ name: { en: "Museum" }, conditions: [{ type: "qr", secretToken: "" }] });
editor.duplicateReward("reward-1");
editor.reorderSpots(2, 0);
editor.reorderRewards(1, 0);
editor.undo();
```

Use `canUndo`/`canRedo` to control history buttons. `resetConfig(newConfig)` replaces
the current draft when an external CMS update arrives. `updateLocalizedField` accepts
paths such as `title`, `description`, `spots.0.name`, or `spots.spot-1.name`.
Updates use functional React state transitions, so consecutive updates are not
lost. External configuration changes replace a clean draft automatically; call
`resetConfig(newConfig)` to explicitly accept a conflicting external draft.

The editor preserves inventory configuration fields such as `stockKey` and
`secondaryStockKey`; the server adapter remains responsible for enforcing the
atomic secondary-stock contract and its fail-closed behavior.
