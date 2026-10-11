# @stamprally/mui

Material UI participant views and authoring components. Supports React 18 / 19 and MUI 5 / 6; MUI and Emotion are peer dependencies.

## Install

```sh
pnpm add @stamprally/core @stamprally/react @stamprally/mui @mui/material @mui/icons-material @emotion/react @emotion/styled
```

## Viewer

Pass the result of `useStampRally` as `adapter` to enable check-ins, reward redemption, and sync status:

```tsx
import { MuiRallyViewer } from "@stamprally/mui";
import { useStampRally } from "@stamprally/react";
import type { StampRallyClient } from "@stamprally/core";

export function RallyPage({ client }: { client: StampRallyClient }) {
  const rally = useStampRally(client);
  return <MuiRallyViewer adapter={rally} sx={{ maxWidth: 960, mx: "auto" }} />;
}
```

With only `config={publicConfig}`, the viewer is read-only. Use `nextAction`, `onNavigate`, and `onCompleted` for spot suggestions and completion. Generate public configuration with `toPublicConfig` and verify participant actions on the server.

## Editor

```tsx
import { MuiAdminRallyEditor } from "@stamprally/mui";

<MuiAdminRallyEditor config={adminConfig} onChange={setAdminConfig} locale="ja" />;
```

The editor provides rally, spot, reward, availability, metadata, and theme settings with preflight checks. Compose lower-level editors for a custom authoring flow.

## Customization

Wrap components with the host's `ThemeProvider` for palettes and dark mode. Use `sx`, card/list `slots` and `slotProps`, or viewer render props to customize presentation. `MuiAccountBackupBanner` and `MuiCloudSyncButton` accept host callbacks for account backup.

See the [MUI example](https://github.com/nitta-a/stamprally-core-app/tree/main/examples/mui-app) for viewer and editor screens.

## License

MIT
