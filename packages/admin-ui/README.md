# @stamprally/admin-ui

Accessible authoring forms and headless editing hooks for React 18 / 19.

## Setup

```sh
pnpm add @stamprally/core @stamprally/admin-ui
```

```tsx
import { AdminRallyEditor } from "@stamprally/admin-ui";
import "@stamprally/admin-ui/styles.css";

<AdminRallyEditor config={adminConfig} locale="en" onChange={setAdminConfig} />;
```

Edit rally content, spots, conditions, availability, rewards, localization, metadata, and theme fields. The editor includes publish-readiness analysis; `JsonConfigIO` handles validated JSON import/export.

## Headless editing

Use `useAdminRallyEditor` to build a custom editor:

```tsx
import { useAdminRallyEditor } from "@stamprally/admin-ui";

const editor = useAdminRallyEditor(adminConfig, { onChange: saveDraft });
editor.addSpot({ name: { en: "Museum" }, conditions: [{ type: "qr", secretToken: "" }] });
editor.reorderSpots(2, 0);
editor.undo();
```

Actions update configuration immutably. Use `canUndo` / `canRedo` for history controls and `resetConfig` to replace the draft. Localized field updates preserve other languages.

Keep the resulting `AdminRallyConfig` private and publish only `toPublicConfig(adminConfig)`. Reward inventory enforcement belongs to the server persistence adapter.

See the [feature guide](https://github.com/nitta-a/stamprally-core-app/blob/main/docs/GUIDE.md#admin-ui-and-headless-editing) for editing and preflight details.

## License

MIT
