import { Alert, Button, Stack } from "@mui/material";
import type { ReactElement } from "react";

export interface MuiAccountBackupBannerProps {
  readonly onLinkAccount: () => unknown | Promise<unknown>;
  readonly accountLabel?: string;
}

/** Material UI adapter for the host-provided Google/OIDC linking callback. */
export function MuiAccountBackupBanner({
  onLinkAccount,
  accountLabel,
}: MuiAccountBackupBannerProps): ReactElement {
  return (
    <Alert severity={accountLabel === undefined ? "info" : "success"}>
      <Stack direction="row" spacing={1} alignItems="center">
        <span>
          {accountLabel === undefined
            ? "Google アカウントでログインして進捗を保存・引き継ぎ"
            : `同期済み: ${accountLabel}`}
        </span>
        {accountLabel === undefined && (
          <Button size="small" onClick={() => void onLinkAccount()}>
            Google で連携
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
