# @stamprally/ui v0.19.0

Participant-facing React components for `@stamprally/core`.

## Setup

```tsx
import { RallyViewer } from "@stamprally/ui";
import "@stamprally/ui/styles.css";

<RallyViewer config={publicConfig} locale="en" />;
```

For a stateful client, pass `client={new StampRallyClient(publicConfig, options)}`.
The viewer subscribes to client state, renders all configured verification conditions,
and exposes check-in and reward actions through the same client.

## Render Props customization

`renderSpotCard`, `renderRewardCard`, `renderStatusBadge`, and the header/footer slots
allow a host application to replace presentation while retaining the domain engine.
`customConditionRenderers` can provide an application-specific QR, NFC, or custom
verification control. A custom renderer calls `onSubmit(proof)` when it has a proof.

```tsx
<RallyViewer
  config={publicConfig}
  locale="ja"
  renderStatusBadge={({ status }) => <span data-status={status}>{status}</span>}
  renderSpotCard={({ spot, children }) => <article><h2>{spot.name}</h2>{children}</article>}
/>
```

Keep private condition secrets, staff passcodes, digital content URLs, and
`serverMetadata` in the server-side `AdminRallyConfig`; publish only the result of
`toPublicConfig`.

Standard cards render localized descriptions and hints, spot imagery and external
reference badges, plus reward descriptions, stock, expiry, and status. Spot cards
with incomplete prerequisites show a lock and disable verification controls.
The status badge values are `UNCLAIMED`, `CLAIMED`, `LOCKED`, and `VERIFYING`.
