import { AdminRallyEditor } from "@stamprally/admin-ui";
import { type AdminRallyConfig, toPublicConfig } from "@stamprally/core";

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
  return toPublicConfig(config);
}
