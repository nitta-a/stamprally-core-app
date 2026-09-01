import { type CloudSyncAdapter, type PublicRallyConfig, StampRallyClient } from "@stamprally/core";
import { useStampRally } from "@stamprally/react";
import { type ReactElement, useMemo } from "react";

const config: PublicRallyConfig = {
  id: "google-demo",
  version: "1",
  title: "Google account sync demo",
  spots: [{ id: "station", orderIndex: 0, name: "Station", conditions: [{ type: "passcode" }] }],
  rewards: [],
};

function cloudSyncAdapter(): CloudSyncAdapter {
  return {
    linkAccount: async (request) => {
      const response = await fetch("/api/account/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      return (await response.json()) as Awaited<ReturnType<CloudSyncAdapter["linkAccount"]>>;
    },
    exportCloudSnapshot: async (request) => {
      const response = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await response.json()) as { readonly snapshot: string };
      return body.snapshot;
    },
    importCloudSnapshot: async (request) => {
      const response = await fetch("/api/snapshots/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      return (await response.json()) as Awaited<
        ReturnType<CloudSyncAdapter["importCloudSnapshot"]>
      >;
    },
  };
}

export function App(): ReactElement {
  const client = useMemo(
    () => new StampRallyClient(config, { cloudSyncAdapter: cloudSyncAdapter() }),
    [],
  );
  const { state, isLoading, onCheckIn, linkAccount, syncProgress } = useStampRally(client);
  if (isLoading) return <p>Loading…</p>;
  return (
    <main>
      <p>Checked in: {state?.records.length ?? 0}</p>
      <button type="button" onClick={() => void onCheckIn("station", "ARRIVED")}>
        Check in
      </button>
      <button
        type="button"
        onClick={() => {
          // GIS supplies response.credential in a real application.
          void linkAccount("GIS_ID_TOKEN", "google").then(() => syncProgress());
        }}
      >
        Sign in with Google and sync
      </button>
    </main>
  );
}
