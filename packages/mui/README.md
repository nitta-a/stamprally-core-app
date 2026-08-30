# @stamprally/mui v0.24.0

MUI (Material UI) adapter components for `@stamprally/core`. The package provides a themed
participant viewer and an authoring editor while keeping the domain engine and existing UI packages
unchanged. MUI, Emotion, React, and React DOM stay in the host application's bundle through peer
dependencies.

## Install

```sh
pnpm add @stamprally/mui @mui/material @mui/icons-material @emotion/react @emotion/styled
```

The package expects React 18 or 19 and MUI 5 or 6. It does not include an authentication provider,
router, HTTP client, or CMS integration.

## Viewer

Pass a `PublicRallyConfig` for a read-only sheet, or pass the return value from `useStampRally` as
`adapter` to enable check-in, reward redemption, and sync status.

```tsx
import { MuiRallyViewer } from "@stamprally/mui";
import { useStampRally } from "@stamprally/react";
import type { StampRallyClient } from "@stamprally/core";

export function RallyPage({ client }: { readonly client: StampRallyClient }) {
  const rally = useStampRally(client);
  return <MuiRallyViewer adapter={rally} sx={{ maxWidth: 960, mx: "auto" }} />;
}
```

All components accept `sx`. Cards and lists also expose `slots` and `slotProps`, and the viewer
supports `renderSpotCard` and `renderRewardCard` for application-specific content.

## Editor

`MuiAdminRallyEditor` owns `useAdminRallyEditor` internally and returns immutable config updates
through `onChange`.

```tsx
import { MuiAdminRallyEditor } from "@stamprally/mui";

<MuiAdminRallyEditor config={adminConfig} onChange={setAdminConfig} locale="ja" />;
```

The editor includes Basic settings, Spots, Rewards, Metadata, and Theme tabs. The lower-level
`MuiSpotEditor`, `MuiSpotList`, `MuiRewardEditor`, and `MuiMetadataEditor` can be composed into a
custom authoring flow.

## Theme integration

The adapter does not create a theme or override the host theme. Wrap it with MUI's
`ThemeProvider` to use custom palettes and dark mode:

```tsx
import { createTheme, ThemeProvider } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#8bd3dd" },
  },
});

<ThemeProvider theme={theme}>
  <MuiRallyViewer config={publicConfig} />
</ThemeProvider>;
```

See [`examples/mui-app`](../../examples/mui-app) for a Vite example containing both viewer and
editor screens.
