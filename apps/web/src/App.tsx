import { AdminRallyEditor } from "@stamprally/admin-ui";
import { StampRallyClient } from "@stamprally/core";
import { useStampRally } from "@stamprally/react";
import { RallyViewer } from "@stamprally/ui";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { DEFAULT_ADMIN_CONFIG, DEFAULT_RALLY_CONFIG } from "./demoConfig.js";
export function App(): ReactElement {
  const [admin, setAdmin] = useState(DEFAULT_ADMIN_CONFIG);
  const config = useMemo(() => DEFAULT_RALLY_CONFIG, []);
  const client = useMemo(() => new StampRallyClient(config, { userId: null }), [config]);
  useStampRally(client);
  return new URLSearchParams(globalThis.location.search).get("view") === "admin" ? (
    <AdminRallyEditor config={admin} onChange={setAdmin} />
  ) : (
    <RallyViewer config={config} client={client} locale="en" />
  );
}
