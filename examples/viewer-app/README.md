# Viewer app

The minimal universal-model viewer uses `RallyViewer` with a
`PublicRallyConfig`. The public projection contains QR entry URLs and GPS
parameters, but never QR tokens, passcodes, custom secret parameters, or
digital reward content. Initialize `StampRallyClient` with the public config and
pass the client to `RallyViewer` to get persistent check-in and reward-claim
actions. Provide `dictionary` when the viewer needs translated labels and
verification feedback.

`SpotItem.location` is participant navigation metadata and is independent
from a GPS check-in condition. `RallyViewer` shows the next available spots by
order by default; pass `nextAction={{ strategy: "nearest", currentLocation }}`
to sort located spots by distance and use `onNavigate` for host-owned map or
route handling. Completion can be configured with `all_spots`, `stamp_count`,
or selected `stamps` without adding a map SDK dependency.
