#!/usr/bin/env bash
set -euo pipefail

verify_dir="$(mktemp -d "${TMPDIR:-/tmp}/stamprally-npm-verify.XXXXXX")"
trap 'rm -rf "$verify_dir"' EXIT
cd "$verify_dir"

npm init -y >/dev/null
npm pkg set type=module >/dev/null
package_install_args=(
  --no-package-lock
  @stamprally/core@latest
  @stamprally/server@latest
  @stamprally/react@latest
  @stamprally/ui@latest
  @stamprally/admin-ui@latest
  @stamprally/mui@latest
)
for attempt in {1..12}; do
  if npm install "${package_install_args[@]}"; then
    break
  fi
  if [[ "$attempt" -eq 12 ]]; then
    echo "Unable to install the published packages after $attempt attempts." >&2
    exit 1
  fi
  echo "npm registry propagation is incomplete (attempt $attempt/12); retrying in 5s." >&2
  sleep 5
done
npm install --no-package-lock --save-dev typescript @types/node

for package_name in core server react ui admin-ui mui; do
  declaration_file="node_modules/@stamprally/${package_name}/dist/index.d.ts"
  if [[ ! -f "$declaration_file" ]]; then
    echo "Missing declaration file: $declaration_file" >&2
    exit 1
  fi
done

npx tsc --init \
  --target ES2022 \
  --module NodeNext \
  --moduleResolution NodeNext \
  --skipLibCheck >/dev/null
cat > test.ts <<'EOF'
import { parseAdminConfig } from "@stamprally/core";
import { StampRallyServer } from "@stamprally/server";
import { useStampRally } from "@stamprally/react";
import { RallyViewer } from "@stamprally/ui";
import { AdminRallyEditor } from "@stamprally/admin-ui";
import { MuiRallyViewer } from "@stamprally/mui";

console.log(
  "All packages imported successfully.",
  parseAdminConfig,
  StampRallyServer,
  useStampRally,
  RallyViewer,
  AdminRallyEditor,
  MuiRallyViewer,
);
EOF

npx tsc --noEmit --project tsconfig.json
cat > test.cjs <<'EOF'
const { parseAdminConfig } = require("@stamprally/core");
const { StampRallyServer } = require("@stamprally/server");
const { useStampRally } = require("@stamprally/react");
const { RallyViewer } = require("@stamprally/ui");
const { AdminRallyEditor } = require("@stamprally/admin-ui");
const { MuiRallyViewer } = require("@stamprally/mui");

console.log(
  "All packages imported successfully.",
  parseAdminConfig,
  StampRallyServer,
  useStampRally,
  RallyViewer,
  AdminRallyEditor,
  MuiRallyViewer,
);
EOF
node test.cjs
