# Viewer app

The participant UI is composed from `@stamprally/react` and `@stamprally/ui`.
Create a `StampRallyClient` with the public rally config and local storage, then
pass the client to `useStampRally`. Call `syncWithServer("/api")` after the
device comes online to submit the offline queue and apply the server-authoritative
state.
