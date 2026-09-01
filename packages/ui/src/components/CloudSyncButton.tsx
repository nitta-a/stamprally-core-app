import type { ReactElement } from "react";

export interface CloudSyncButtonProps {
  readonly onSync: () => unknown | Promise<unknown>;
  readonly accountLabel?: string;
  readonly isSyncing?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** Manual cloud sync trigger that does not depend on a particular auth SDK. */
export function CloudSyncButton({
  onSync,
  accountLabel,
  isSyncing = false,
  disabled = false,
  className,
}: CloudSyncButtonProps): ReactElement {
  return (
    <div className={className}>
      <span role="status" aria-live="polite">
        {accountLabel === undefined ? "未連携" : `同期済み: ${accountLabel}`}
      </span>{" "}
      <button type="button" onClick={() => void onSync()} disabled={disabled || isSyncing}>
        {isSyncing ? "同期中..." : "今すぐ同期"}
      </button>
    </div>
  );
}
