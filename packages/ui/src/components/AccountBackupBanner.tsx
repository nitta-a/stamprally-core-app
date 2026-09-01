import type { CSSProperties, ReactElement } from "react";

export interface AccountBackupBannerProps {
  readonly onLinkAccount: () => unknown | Promise<unknown>;
  readonly accountLabel?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Lightweight host-agnostic prompt for linking an anonymous rally session. */
export function AccountBackupBanner({
  onLinkAccount,
  accountLabel,
  className,
  style,
}: AccountBackupBannerProps): ReactElement {
  return (
    <aside className={className} style={style} role="note" aria-label="Account backup">
      <strong>進捗を保存・引き継ぎ</strong>
      <span>
        {accountLabel === undefined
          ? "Google アカウントでログインして進捗を保存・引き継ぎ"
          : `同期済み: ${accountLabel}`}
      </span>
      {accountLabel === undefined && (
        <button type="button" onClick={() => void onLinkAccount()}>
          Google で連携
        </button>
      )}
    </aside>
  );
}
