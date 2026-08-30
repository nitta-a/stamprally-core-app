import type {
  LocaleDictionary,
  OfflineStorageCapability,
  RejectedOperationHistoryEntry,
  SyncState,
} from "@stamprally/core";
import type { CSSProperties, ReactElement } from "react";
import { type BuiltInUiLocale, DEFAULT_UI_DICTIONARY } from "../locales/index.js";

export interface SyncStateContext {
  readonly syncState: SyncState;
  readonly isSyncing: boolean;
  readonly pendingCount: number;
  readonly rejectedHistory: ReadonlyArray<RejectedOperationHistoryEntry>;
  readonly storageCapability: OfflineStorageCapability;
  readonly isStoragePersistent: boolean;
}

export interface SyncStatusBannerProps<TLocale extends string = string> {
  readonly status: SyncStateContext;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly className?: string;
  readonly style?: CSSProperties;
}

function text<TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string {
  return (
    dictionary?.[locale]?.[key] ??
    DEFAULT_UI_DICTIONARY[locale as BuiltInUiLocale]?.[key] ??
    fallback
  );
}

export function SyncStatusBanner<TLocale extends string = "en">({
  status,
  locale = "en" as TLocale,
  dictionary,
  className,
  style,
}: SyncStatusBannerProps<TLocale>): ReactElement | null {
  if (status.isSyncing)
    return (
      <div className={className} style={style} role="status" aria-live="polite">
        <span aria-hidden="true">⟳</span>{" "}
        {text(dictionary, locale, "sync.syncing", "未同期の操作をサーバーへ送信中...")}
      </div>
    );
  if (status.rejectedHistory.length > 0) {
    const detail = status.rejectedHistory[status.rejectedHistory.length - 1]?.reason.message;
    return (
      <div className={className} style={style} role="alert" aria-live="assertive">
        <strong>
          {text(
            dictionary,
            locale,
            "sync.rollback",
            "一部のチェックインがサーバーにより取り消されました",
          )}
        </strong>
        {detail === undefined ? null : <span>{detail}</span>}
      </div>
    );
  }
  if (status.pendingCount > 0)
    return (
      <div className={className} style={style} role="status" aria-live="polite">
        {text(dictionary, locale, "sync.offline", "オフラインで記録中")} (
        {text(dictionary, locale, "sync.unsynced", "未同期")}: {status.pendingCount}件)
      </div>
    );
  return null;
}
