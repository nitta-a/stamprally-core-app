import { Button, Stack, Typography } from "@mui/material";
import type { ReactElement } from "react";

export interface MuiCloudSyncButtonProps {
  readonly onSync: () => unknown | Promise<unknown>;
  readonly accountLabel?: string;
  readonly isSyncing?: boolean;
  readonly disabled?: boolean;
}

/** Material UI adapter for a manual cloud snapshot synchronization trigger. */
export function MuiCloudSyncButton({
  onSync,
  accountLabel,
  isSyncing = false,
  disabled = false,
}: MuiCloudSyncButtonProps): ReactElement {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" component="span" aria-live="polite">
        {accountLabel === undefined ? "未連携" : `同期済み: ${accountLabel}`}
      </Typography>
      <Button variant="outlined" onClick={() => void onSync()} disabled={disabled || isSyncing}>
        {isSyncing ? "同期中..." : "今すぐ同期"}
      </Button>
    </Stack>
  );
}
