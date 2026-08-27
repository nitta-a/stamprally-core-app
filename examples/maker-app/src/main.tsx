import { AdminRallyEditor } from "@stamprally/admin-ui";
import { type AdminRallyConfig, toPublicRallyConfig } from "@stamprally/core";

export function MakerApp({
  config,
  onChange,
}: {
  readonly config: AdminRallyConfig;
  readonly onChange: (config: AdminRallyConfig) => void;
}) {
  return <AdminRallyEditor config={config} onChange={onChange} />;
}

export function publish(config: AdminRallyConfig) {
  return toPublicRallyConfig(config);
}
