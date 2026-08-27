import type { PublicRallyConfig } from "@stamprally/core";
import { RallyViewer } from "@stamprally/ui";

export function ViewerApp({ config }: { readonly config: PublicRallyConfig }) {
  return <RallyViewer config={config} locale="en" />;
}
