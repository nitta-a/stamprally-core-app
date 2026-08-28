# Viewer app

The minimal universal-model viewer uses `RallyViewer` with a
`PublicRallyConfig`. The public projection contains QR entry URLs and GPS
parameters, but never QR tokens, passcodes, custom secret parameters, or
digital reward content. Initialize `StampRallyClient` with the public config and
pass the client to `RallyViewer` to get persistent check-in and reward-claim
actions. Provide `dictionary` when the viewer needs translated labels and
verification feedback.
