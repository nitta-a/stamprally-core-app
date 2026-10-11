# @stamprally/ui

Accessible participant components for React 18 / 19: rally viewing, check-ins, progress, rewards, and synchronization status.

## Setup

```sh
pnpm add @stamprally/core @stamprally/react @stamprally/ui
```

```tsx
import { RallyViewer } from "@stamprally/ui";
import "@stamprally/ui/styles.css";

<RallyViewer config={publicConfig} client={client} locale="en" />;
```

Pass a stable `StampRallyClient` or a server-backed `adapter` to enable participant actions. With only `config`, the viewer displays a read-only sheet. Publish configuration through `toPublicConfig`; keep verification secrets and server-only metadata on the server.

## Customization

- `locale` and `dictionary`: localized content and UI labels.
- `renderSpotCard`, `renderRewardCard`, `renderStatusBadge`, and header/footer slots: custom presentation.
- `customConditionRenderers`: custom verification controls that submit proof through `onSubmit`.
- `nextAction`, `onNavigate`, `onCompleted`: spot suggestions, host-owned navigation, and completion callbacks.
- `showSyncStatus`, `renderSyncStatus`: the built-in sync banner or a custom status view.

The viewer includes next-action, completion, and sync panels. `StampSheet` provides a read-only progress view; `AccountBackupBanner` and `CloudSyncButton` accept host callbacks for account backup.

See the [feature guide](https://github.com/nitta-a/stamprally-core-app/blob/main/docs/GUIDE.md) for rendering examples, availability, and reward goals.

## License

MIT
