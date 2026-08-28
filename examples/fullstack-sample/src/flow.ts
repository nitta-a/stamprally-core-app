import { AdminRallyEditor } from "@stamprally/admin-ui";
import { type AdminRallyConfig, StampRallyClient, toPublicConfig } from "@stamprally/core";
import { InMemoryServerPersistenceAdapter, StampRallyServer } from "@stamprally/server";
import { RallyViewer } from "@stamprally/ui";

export function createSample(config: AdminRallyConfig) {
  const publicConfig = toPublicConfig(config);
  const persistence = new InMemoryServerPersistenceAdapter();
  const server = new StampRallyServer(config, persistence);
  const client = new StampRallyClient(publicConfig, { userId: null });
  return { AdminRallyEditor, RallyViewer, client, publicConfig, server };
}
