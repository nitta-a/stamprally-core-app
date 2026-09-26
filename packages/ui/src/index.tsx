"use client";

import type {
  AvailabilityStatus,
  AvailabilitySuggestionMode,
  CheckInOptions,
  CheckInResult,
  ClaimOptions,
  ClaimResult,
  SpotStatus as CoreSpotStatus,
  GeoCoordinates,
  LocaleDictionary,
  NextSpotStrategy,
  NextSpotSuggestion,
  PublicCheckInCondition,
  PublicRallyConfig,
  PublicReward,
  PublicSpotItem,
  RallyAdapterSyncState,
  RallyConfig,
  RallyInventoryState,
  RewardProgress,
  RewardState,
  SpotItem,
  StampRallyClient,
  StampRallyProgress,
  StampRallyState,
  SyncEventListener,
  UserRallyState,
} from "@stamprally/core";
import { getNextSpotSuggestions } from "@stamprally/core";
import { CompletionPanel, type CompletionPanelProps } from "./components/CompletionPanel.js";
import { NextActionPanel, type NextActionPanelProps } from "./components/NextActionPanel.js";
import { type SyncStateContext, SyncStatusBanner } from "./components/SyncStatusBanner.js";
import { resolveUiLabel } from "./locales/index.js";

export type { AccountBackupBannerProps } from "./components/AccountBackupBanner.js";
export { AccountBackupBanner } from "./components/AccountBackupBanner.js";
export type { CloudSyncButtonProps } from "./components/CloudSyncButton.js";
export { CloudSyncButton } from "./components/CloudSyncButton.js";
export type { CompletionPanelProps } from "./components/CompletionPanel.js";
export { CompletionPanel } from "./components/CompletionPanel.js";
export type { GpsProximityMeterProps } from "./components/GpsProximityMeter.js";
export { GpsProximityMeter } from "./components/GpsProximityMeter.js";
export type { NextActionPanelProps } from "./components/NextActionPanel.js";
export { NextActionPanel } from "./components/NextActionPanel.js";
export type { StaffRedemptionViewProps } from "./components/StaffRedemptionView.js";
export { StaffRedemptionView } from "./components/StaffRedemptionView.js";
export type { SyncStateContext, SyncStatusBannerProps } from "./components/SyncStatusBanner.js";
export { SyncStatusBanner } from "./components/SyncStatusBanner.js";
export type { BuiltInUiLocale } from "./locales/index.js";
export { DEFAULT_UI_DICTIONARY, UI_DICTIONARIES } from "./locales/index.js";

import {
  calculateProgress,
  calculateRewardProgress,
  evaluateRallyAvailability,
  evaluateSpotAvailability,
  evaluateSpotStatus,
  getCurrentGeoContext,
  isNfcSupported,
  isQrSupported,
  readNfcContext,
  readQrContext,
  resolveLocalizedText,
} from "@stamprally/core";
import {
  type ComponentType,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ViewerClassName =
  | "root"
  | "header"
  | "card"
  | "condition"
  | "slot"
  | "badge"
  | "modal"
  | "button"
  | "action"
  | "feedback"
  | "reward"
  | "nextAction"
  | "completion"
  | "footer";

export type ViewerSyncStateContext = SyncStateContext;
export type ViewerStyle = CSSProperties & {
  readonly [key: `--${string}`]: string | number | undefined;
};
export type ViewerStyles = Partial<Record<ViewerClassName, ViewerStyle>>;
export type ViewerClassNames = Partial<Record<ViewerClassName, string>>;
export type SpotStatus = CoreSpotStatus;

export interface ConditionRendererProps<TLocale extends string = string> {
  readonly spot: PublicSpotItem<TLocale>;
  readonly condition: PublicCheckInCondition;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly disabled: boolean;
  readonly classNames?: ViewerClassNames;
  readonly styles?: ViewerStyles;
  // biome-ignore lint/suspicious/noConfusingVoidType: custom renderers may fire-and-forget while built-ins await feedback.
  readonly onSubmit: (proof: unknown) => void | Promise<unknown>;
}
export type ConditionRenderer<TLocale extends string = string> = ComponentType<
  ConditionRendererProps<TLocale>
>;

export interface SpotCardProps<TLocale extends string = string> {
  readonly spot: PublicSpotItem<TLocale>;
  readonly state: UserRallyState;
  readonly status: SpotStatus;
  readonly availabilityStatus?: AvailabilityStatus;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly children: ReactNode;
}
export interface RewardCardProps<TLocale extends string = string> {
  readonly reward: PublicReward<TLocale>;
  readonly state: RewardState | undefined;
  readonly progress: RewardProgress;
  readonly missingSpotIds: ReadonlyArray<string>;
  readonly missingSpotNames: ReadonlyArray<string>;
  readonly inventory?: RallyInventoryState;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onViewReward?: (rewardId: string) => void;
  readonly onClaim:
    | ((rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>)
    | undefined;
}
export interface RallyViewerSlots<TLocale extends string = string> {
  readonly headerSlot?:
    | ReactNode
    | ((props: {
        readonly config: PublicRallyConfig<TLocale>;
        readonly state: UserRallyState;
      }) => ReactNode);
  readonly footerSlot?: ReactNode;
  readonly renderSyncStatus?: (status: SyncStateContext) => ReactNode;
  readonly renderSpotCard?: (props: SpotCardProps<TLocale>) => ReactNode;
  readonly renderRewardCard?: (props: RewardCardProps<TLocale>) => ReactNode;
  readonly renderStatusBadge?: (props: { readonly status: SpotStatus }) => ReactNode;
  readonly renderVerifyingState?: () => ReactNode;
  readonly renderSuccessFeedback?: (result: CheckInResult) => ReactNode;
  readonly renderErrorFeedback?: (error: string) => ReactNode;
  readonly renderStampEffect?: (spot: PublicSpotItem<TLocale>) => ReactNode;
  readonly onStampStamped?: (spot: SpotItem<TLocale>) => void;
  readonly renderNextAction?: (props: NextActionPanelProps<TLocale>) => ReactNode;
  readonly renderCompletion?: (props: CompletionPanelProps<TLocale>) => ReactNode;
}

export interface RallyViewerAdapter<TLocale extends string = string> {
  readonly config: PublicRallyConfig<TLocale>;
  readonly onCheckIn: (
    spotId: string,
    proof: unknown,
    options?: CheckInOptions,
  ) => Promise<CheckInResult>;
  readonly onClaimReward?: (rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>;
  readonly state?: UserRallyState;
  readonly isLoading?: boolean;
  readonly error?: Error | null;
  readonly onSync?: () => Promise<void>;
  readonly syncState?: RallyAdapterSyncState;
  readonly subscribe?: (listener: (state: UserRallyState) => void) => () => void;
}
export interface RallyViewerProps<TLocale extends string = string>
  extends RallyViewerSlots<TLocale> {
  readonly config?: PublicRallyConfig<TLocale>;
  readonly client?: StampRallyClient;
  readonly adapter?: RallyViewerAdapter<TLocale>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly classNames?: ViewerClassNames;
  readonly styles?: ViewerStyles;
  readonly style?: ViewerStyle;
  readonly customConditionRenderers?: Partial<
    Record<PublicCheckInCondition["type"], ConditionRenderer<TLocale>>
  >;
  readonly onSyncEvent?: SyncEventListener;
  readonly showSyncStatus?: boolean;
  readonly nextAction?: {
    readonly enabled?: boolean;
    readonly strategy?: NextSpotStrategy;
    readonly rewardId?: string;
    readonly availability?: AvailabilitySuggestionMode;
    readonly now?: string;
    readonly maxSuggestions?: number;
    readonly currentLocation?: GeoCoordinates;
  };
  readonly onNavigate?: (spot: PublicSpotItem<TLocale>, suggestion: NextSpotSuggestion) => void;
  readonly onViewReward?: (rewardId: string) => void;
  readonly onCompleted?: (progress: StampRallyProgress, state: UserRallyState) => void;
}

const label = <TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string => resolveUiLabel(dictionary, locale, key, fallback);
function availabilityConfigured(config: PublicRallyConfig): boolean {
  return (
    config.availability !== undefined ||
    config.spots.some(({ availability }) => availability !== undefined)
  );
}
function availabilityText<TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  status: AvailabilityStatus,
): string {
  const key = `availability.${status.toLowerCase()}`;
  const fallback: Record<AvailabilityStatus, string> = {
    OPEN: "Open",
    CLOSED: "Closed",
    UPCOMING: "Opens soon",
    ENDED: "Ended",
  };
  return label(dictionary, locale, key, fallback[status]);
}
const join = (...names: ReadonlyArray<string | undefined>): string | undefined => {
  const value = names.filter((name): name is string => name !== undefined && name !== "").join(" ");
  return value === "" ? undefined : value;
};
type VerificationStatus = "idle" | "loading" | "success" | "error";

function DefaultCondition<TLocale extends string>({
  condition,
  dictionary,
  locale,
  disabled,
  classNames,
  styles,
  onSubmit,
}: ConditionRendererProps<TLocale>): ReactElement {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const text = (key: string, fallback: string): string => label(dictionary, locale, key, fallback);
  const verify = async (proof: unknown): Promise<void> => {
    setStatus("loading");
    setError(null);
    try {
      const result = await onSubmit(proof);
      if (
        result !== undefined &&
        typeof result === "object" &&
        result !== null &&
        "ok" in result &&
        result.ok === false
      ) {
        setStatus("error");
        setError(text("verificationFailed", "Verification failed."));
      } else setStatus("success");
    } catch {
      setStatus("error");
      setError(text("verificationFailed", "Verification failed."));
    }
  };
  const readLocation = (): void => {
    setStatus("loading");
    void getCurrentGeoContext().then((result) => {
      if (result.ok) void verify(result.value);
      else {
        setStatus("error");
        setError(result.error.message);
      }
    });
  };
  const readNfc = (): void => {
    setStatus("loading");
    void readNfcContext().then((result) => {
      if (result.ok) void verify(result.value);
      else {
        setStatus("error");
        setError(result.error.message);
      }
    });
  };
  const scanQr = (): void => {
    if (videoRef.current === null) return;
    setStatus("loading");
    void readQrContext(videoRef.current).then((result) => {
      if (result.ok) void verify(result.value);
      else {
        setStatus("error");
        setError(result.error.message);
      }
    });
  };
  return (
    <div>
      {condition.type === "qr" && (
        <>
          <video
            ref={videoRef}
            aria-label={text("qrCamera", "QR camera")}
            hidden={!isQrSupported()}
          >
            <track kind="captions" />
          </video>
          <button
            type="button"
            className={join("sry-action", classNames?.action, classNames?.button)}
            style={styles?.button ?? styles?.action}
            disabled={disabled || !isQrSupported()}
            onClick={scanQr}
          >
            {text("scanQr", "Scan QR")}
          </button>
          <details>
            <summary>{text("qrManualFallback", "Enter the code manually")}</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void verify(value);
              }}
            >
              <label>
                {text("qrValue", "QR value")}
                <input
                  aria-label={text("qrValue", "QR value")}
                  placeholder={condition.qrEntryUrl ?? text("qrPlaceholder", "Paste a QR value")}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className={join("sry-action", classNames?.action, classNames?.button)}
                style={styles?.button ?? styles?.action}
                disabled={disabled || value.trim() === ""}
              >
                {text("checkIn", "Check in")}
              </button>
            </form>
          </details>
        </>
      )}
      {condition.type === "gps" && (
        <button
          type="button"
          className={join("sry-action", classNames?.action, classNames?.button)}
          style={styles?.button ?? styles?.action}
          disabled={disabled}
          onClick={readLocation}
        >
          {text("checkLocation", "Check location")}
        </button>
      )}
      {condition.type === "nfc" && (
        <button
          type="button"
          className={join("sry-action", classNames?.action, classNames?.button)}
          style={styles?.button ?? styles?.action}
          disabled={disabled || !isNfcSupported()}
          onClick={readNfc}
        >
          {text("readNfc", "Read NFC")}
        </button>
      )}
      {(condition.type === "passcode" || condition.type === "custom") && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verify(value);
          }}
        >
          <label>
            {text(
              condition.type === "passcode" ? "passcode" : "proof",
              condition.type === "passcode" ? "Passcode" : "Proof",
            )}
            <input
              aria-label={text(
                condition.type === "passcode" ? "passcode" : "proof",
                condition.type === "passcode" ? "Passcode" : "Proof",
              )}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className={join("sry-action", classNames?.action, classNames?.button)}
            style={styles?.button ?? styles?.action}
            disabled={disabled || value.trim() === ""}
          >
            {text("checkIn", "Check in")}
          </button>
        </form>
      )}
      <div
        className={join("sry-feedback", classNames?.feedback)}
        style={styles?.feedback}
        aria-live="polite"
        role={status === "error" ? "alert" : undefined}
      >
        {status === "loading" && text("verifying", "Verifying…")}
        {status === "error" && (error ?? text("verificationFailed", "Verification failed."))}
      </div>
    </div>
  );
}

function DefaultRewardCard<TLocale extends string>({
  reward,
  state,
  progress,
  missingSpotIds,
  missingSpotNames,
  inventory,
  locale,
  dictionary,
  onViewReward,
  onClaim,
  classNames,
  styles,
}: RewardCardProps<TLocale> & {
  readonly classNames?: ViewerClassNames;
  readonly styles?: ViewerStyles;
}): ReactElement {
  const status = state?.status ?? "LOCKED";
  const configuredRemaining =
    inventory?.rewardRemaining?.[reward.id] ??
    (reward.stockLimit === undefined
      ? undefined
      : Math.max(0, reward.stockLimit - (state?.redeemedCount ?? 0)));
  const sharedRemaining = inventory?.sharedRemaining;
  const canView = reward.redemptionMethod === "view_only" && onViewReward !== undefined;
  const canRedeem = reward.redemptionMethod !== "view_only" && onClaim !== undefined;
  const unavailable =
    status !== "AVAILABLE" ||
    (!canView && !canRedeem) ||
    sharedRemaining === 0 ||
    configuredRemaining === 0;
  const expiry = reward.validUntil === undefined ? undefined : new Date(reward.validUntil);
  return (
    <article className={join("sry-reward-card", classNames?.reward)} style={styles?.reward}>
      <h3>{resolveLocalizedText(reward.title, locale)}</h3>
      {reward.description !== undefined && (
        <p>{resolveLocalizedText(reward.description, locale)}</p>
      )}
      {!progress.isUnlocked && (
        <fieldset aria-label={label(dictionary, locale, "reward.progress", "Reward progress")}>
          <legend>{label(dictionary, locale, "reward.progress", "Reward progress")}</legend>
          <progress
            max={100}
            value={progress.percentage}
            aria-label={label(dictionary, locale, "reward.progress", "Reward progress")}
          />
          <span>
            {progress.acquired} / {progress.required}
          </span>
          {missingSpotNames.length > 0 && (
            <ul aria-label={label(dictionary, locale, "reward.missingSpots", "Spots still needed")}>
              {missingSpotNames.map((name, index) => (
                <li key={missingSpotIds[index]}>{name}</li>
              ))}
            </ul>
          )}
        </fieldset>
      )}
      {sharedRemaining !== undefined && (
        <span>
          {label(dictionary, locale, "reward.sharedRemaining", "Overall remaining")}:{" "}
          {sharedRemaining}
        </span>
      )}
      {configuredRemaining !== undefined && (
        <>
          {configuredRemaining <= 3 && (
            <span>{label(dictionary, locale, "reward.lowStock", "Only a few left")}</span>
          )}
          <span>
            {`${configuredRemaining} ${label(dictionary, locale, "reward.remaining", "remaining")}`}
          </span>
        </>
      )}
      {expiry !== undefined && !Number.isNaN(expiry.getTime()) && (
        <time dateTime={reward.validUntil}>
          {label(dictionary, locale, "reward.validUntil", "Valid until")}:{" "}
          {expiry.toLocaleString(locale)}
        </time>
      )}
      <button
        type="button"
        className={join(classNames?.reward, classNames?.button)}
        style={styles?.button}
        disabled={unavailable}
        onClick={() => {
          if (canView) onViewReward?.(reward.id);
          else if (canRedeem) void onClaim?.(reward.id);
        }}
      >
        {status === "AVAILABLE"
          ? canView
            ? label(dictionary, locale, "reward.claim", "View reward")
            : label(dictionary, locale, "reward.redeem", "Redeem reward")
          : label(dictionary, locale, `status.${status.toLowerCase()}`, status)}
      </button>
    </article>
  );
}

export function RallyViewer<TLocale extends string = string>({
  config: providedConfig,
  client,
  adapter,
  locale,
  dictionary,
  classNames = {},
  styles = {},
  style,
  customConditionRenderers = {},
  onSyncEvent,
  headerSlot,
  footerSlot,
  renderSpotCard,
  renderRewardCard,
  renderStatusBadge,
  renderVerifyingState,
  renderSuccessFeedback,
  renderErrorFeedback,
  renderStampEffect,
  onStampStamped,
  renderNextAction,
  renderCompletion,
  renderSyncStatus,
  showSyncStatus = true,
  nextAction,
  onNavigate,
  onViewReward,
  onCompleted,
}: RallyViewerProps<TLocale>): ReactElement {
  const config = providedConfig ?? client?.getConfig() ?? adapter?.config;
  const [state, setState] = useState<UserRallyState | null>(
    () => client?.getState() ?? adapter?.state ?? null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CheckInResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStateContext>(() => ({
    syncState: client?.syncState ?? "idle",
    isSyncing: client?.syncState === "syncing",
    pendingCount: client?.pendingCount ?? 0,
    rejectedHistory: client?.rejectedHistory ?? [],
    storageCapability: client?.storageCapability ?? "disabled",
    isStoragePersistent: client?.isStoragePersistent ?? false,
  }));
  useEffect(() => {
    if (client === undefined) {
      if (adapter?.subscribe === undefined) return;
      return adapter.subscribe(setState);
    }
    const unsubscribe = client.subscribe(setState);
    void client.init().then(setState);
    return unsubscribe;
  }, [adapter, client]);
  useEffect(() => {
    if (client === undefined || onSyncEvent === undefined) return;
    return client.subscribeSyncEvents(onSyncEvent);
  }, [client, onSyncEvent]);
  useEffect(() => {
    if (client === undefined) return;
    const update = (): void =>
      setSyncStatus({
        syncState: client.syncState,
        isSyncing: client.syncState === "syncing",
        pendingCount: client.pendingCount,
        rejectedHistory: client.rejectedHistory,
        storageCapability: client.storageCapability,
        isStoragePersistent: client.isStoragePersistent,
      });
    update();
    return client.subscribeSyncState(update);
  }, [client]);
  if (config === undefined) throw new Error("RallyViewer requires config, client, or adapter.");
  const currentState = state ?? {
    rallyId: config.id,
    userId: null,
    records: [],
    rewards: [],
    updatedAt: "",
  };
  const progress = useMemo<StampRallyProgress>(
    () => calculateProgress(currentState, config),
    [config, currentState],
  );
  const completedRef = useRef<boolean | null>(state === null ? null : progress.isCompleted);
  const availabilityNow = nextAction?.now ?? new Date().toISOString();
  const suggestions = useMemo(
    () =>
      getNextSpotSuggestions(currentState, config, {
        ...(nextAction?.strategy === undefined ? {} : { strategy: nextAction.strategy }),
        ...(nextAction?.rewardId === undefined ? {} : { rewardId: nextAction.rewardId }),
        ...(nextAction?.availability === undefined
          ? { availability: "open_first" as const }
          : { availability: nextAction.availability }),
        now: availabilityNow,
        ...(nextAction?.currentLocation === undefined
          ? {}
          : { currentLocation: nextAction.currentLocation }),
      }),
    [
      availabilityNow,
      config,
      currentState,
      nextAction?.availability,
      nextAction?.currentLocation,
      nextAction?.rewardId,
      nextAction?.strategy,
    ],
  );
  useEffect(() => {
    if (!completedRef.current && progress.isCompleted) onCompleted?.(progress, currentState);
    completedRef.current = progress.isCompleted;
  }, [currentState, onCompleted, progress]);
  const checkIn =
    adapter?.onCheckIn ??
    (client === undefined
      ? undefined
      : (spotId: string, proof: unknown, options?: CheckInOptions) =>
          client.checkIn(spotId, proof, options));
  const claim =
    adapter?.onClaimReward ??
    (client === undefined
      ? undefined
      : (rewardId: string, options?: ClaimOptions) => client.claimReward(rewardId, options));
  const submit = useCallback(
    async (spotId: string, proof: unknown): Promise<CheckInResult | undefined> => {
      if (checkIn === undefined) return undefined;
      const target = config.spots.find((spot) => spot.id === spotId);
      if (target !== undefined && evaluateSpotStatus(target, currentState) === "LOCKED") {
        const result: CheckInResult = {
          ok: false,
          error: {
            code: "PREREQUISITES_NOT_MET",
            spotId,
            message: "Complete the prerequisite spots before checking in.",
          },
        };
        setFeedback(result);
        return result;
      }
      setBusy(spotId);
      const result = await checkIn(spotId, proof).finally(() => setBusy(null));
      setFeedback(result);
      if (result.ok) {
        setState(result.value.state);
        if (onStampStamped !== undefined && target !== undefined)
          onStampStamped(target as unknown as SpotItem<TLocale>);
      }
      return result;
    },
    [checkIn, config.spots, currentState, onStampStamped],
  );
  return (
    <section
      className={join("sry-viewer", classNames.root)}
      style={styles.root ?? style}
      aria-label={label(dictionary, locale, "viewer", "Stamp rally")}
    >
      <header className={join("sry-header", classNames.header)} style={styles.header}>
        {typeof headerSlot === "function"
          ? headerSlot({ config, state: currentState })
          : headerSlot}
        {headerSlot === undefined && (
          <h1>{resolveLocalizedText(config.title, locale) || config.id}</h1>
        )}
        <progress
          className="sry-progress"
          aria-label={label(dictionary, locale, "completionProgress", "Clear progress")}
          max={100}
          value={progress.completionPercentage}
        />
        <span className="sry-progress__primary">
          {progress.completionAcquired}/{progress.completionRequired}
        </span>
        {availabilityConfigured(config) && (
          <p role="status">
            {availabilityText(
              dictionary,
              locale,
              evaluateRallyAvailability(config.availability, availabilityNow).status,
            )}
          </p>
        )}
        {progress.completionRequired !== progress.total && (
          <span className="sry-progress__secondary">
            {label(dictionary, locale, "overallProgress", "Overall")}: {progress.acquired}/
            {progress.total}
          </span>
        )}
      </header>
      {busy !== null &&
        (renderVerifyingState?.() ?? (
          <div className={classNames.feedback} style={styles.feedback} role="status">
            {label(dictionary, locale, "verifying", "Verifying…")}
          </div>
        ))}
      {feedback?.ok === true &&
        (renderSuccessFeedback?.(feedback) ?? (
          <div className={classNames.feedback} style={styles.feedback} role="status">
            <div className="stamp-celebration" aria-hidden="true">
              {["one", "two", "three", "four", "five", "six", "seven", "eight"].map((piece) => (
                <span key={piece} />
              ))}
            </div>
            {(() => {
              const stampedSpot = config.spots.find(
                (spot) => spot.id === feedback.value.record.stampId,
              );
              return stampedSpot === undefined ? null : renderStampEffect?.(stampedSpot);
            })()}
            {(() => {
              const stampedSpot = config.spots.find(
                (spot) => spot.id === feedback.value.record.stampId,
              );
              return label(
                dictionary,
                locale,
                "feedback.stampAcquired",
                "{spot} collected. {acquired}/{required} to complete.",
              )
                .replace(
                  "{spot}",
                  stampedSpot === undefined
                    ? "Stamp"
                    : resolveLocalizedText(stampedSpot.name, locale),
                )
                .replace("{acquired}", String(progress.completionAcquired))
                .replace("{required}", String(progress.completionRequired));
            })()}
          </div>
        ))}
      {feedback?.ok === false &&
        (renderErrorFeedback?.(
          "message" in feedback.error ? feedback.error.message : feedback.error.code,
        ) ?? (
          <div className={classNames.feedback} style={styles.feedback} role="alert">
            {"message" in feedback.error ? feedback.error.message : feedback.error.code}
          </div>
        ))}
      {showSyncStatus &&
        (renderSyncStatus?.(syncStatus) ?? (
          <SyncStatusBanner
            status={syncStatus}
            locale={locale}
            {...(dictionary === undefined ? {} : { dictionary })}
            {...(classNames.feedback === undefined ? {} : { className: classNames.feedback })}
            {...(styles.feedback === undefined ? {} : { style: styles.feedback })}
          />
        ))}
      {!progress.isCompleted &&
        nextAction?.enabled !== false &&
        (renderNextAction?.({
          suggestions,
          locale,
          ...(dictionary === undefined ? {} : { dictionary }),
          ...(nextAction?.currentLocation === undefined
            ? {}
            : { currentLocation: nextAction.currentLocation }),
          ...(onNavigate === undefined
            ? {}
            : { onNavigate: (suggestion) => onNavigate(suggestion.spot, suggestion) }),
          ...(nextAction?.maxSuggestions === undefined
            ? {}
            : { maxSuggestions: nextAction.maxSuggestions }),
          ...(classNames.nextAction === undefined ? {} : { className: classNames.nextAction }),
        }) ?? (
          <NextActionPanel
            suggestions={suggestions}
            locale={locale}
            {...(dictionary === undefined ? {} : { dictionary })}
            {...(nextAction?.currentLocation === undefined
              ? {}
              : { currentLocation: nextAction.currentLocation })}
            {...(onNavigate === undefined
              ? {}
              : { onNavigate: (suggestion) => onNavigate(suggestion.spot, suggestion) })}
            {...(nextAction?.maxSuggestions === undefined
              ? {}
              : { maxSuggestions: nextAction.maxSuggestions })}
            {...(classNames.nextAction === undefined ? {} : { className: classNames.nextAction })}
          />
        ))}
      {progress.isCompleted &&
        (renderCompletion?.({
          progress,
          rewards: config.rewards,
          rewardStates: currentState.rewards,
          locale,
          ...(dictionary === undefined ? {} : { dictionary }),
          ...(onViewReward === undefined ? {} : { onViewReward }),
          ...(claim === undefined ? {} : { onClaimReward: (rewardId) => void claim(rewardId) }),
          className: classNames.completion ?? "sry-completion",
        }) ?? (
          <CompletionPanel
            progress={progress}
            rewards={config.rewards}
            rewardStates={currentState.rewards}
            locale={locale}
            {...(dictionary === undefined ? {} : { dictionary })}
            {...(onViewReward === undefined ? {} : { onViewReward })}
            {...(claim === undefined ? {} : { onClaimReward: (rewardId) => void claim(rewardId) })}
            className={classNames.completion ?? "sry-completion"}
          />
        ))}
      {(() => {
        const spots = progress.isCompleted
          ? config.spots.filter((spot) => evaluateSpotStatus(spot, currentState) !== "CLAIMED")
          : config.spots;
        const claimedSpots = progress.isCompleted
          ? config.spots.filter((spot) => evaluateSpotStatus(spot, currentState) === "CLAIMED")
          : [];
        const renderSpot = (spot: PublicSpotItem<TLocale>): ReactElement => {
          const status: SpotStatus =
            busy === spot.id ? "VERIFYING" : evaluateSpotStatus(spot, currentState);
          const claimed = status === "CLAIMED";
          const locked = status === "LOCKED";
          const prerequisiteNames = (spot.prerequisites ?? [])
            .map((prerequisiteId) =>
              config.spots.find((candidate) => candidate.id === prerequisiteId),
            )
            .filter((candidate): candidate is PublicSpotItem<TLocale> => candidate !== undefined)
            .map((candidate) => resolveLocalizedText(candidate.name, locale));
          const lockedMessage =
            prerequisiteNames.length === 0
              ? label(
                  dictionary,
                  locale,
                  "prerequisitesNotMet",
                  "Complete the prerequisite spots before checking in.",
                )
              : label(
                  dictionary,
                  locale,
                  "lockedPrerequisites",
                  "Complete {spots} to unlock this spot.",
                ).replace("{spots}", prerequisiteNames.join(", "));
          const children = spot.conditions.map((condition) => {
            const Renderer = customConditionRenderers[condition.type] ?? DefaultCondition;
            return (
              <div
                className={classNames.condition}
                style={styles.condition}
                key={`${spot.id}-${condition.type}-${JSON.stringify(condition)}`}
              >
                <Renderer
                  spot={spot}
                  condition={condition}
                  locale={locale}
                  {...(dictionary === undefined ? {} : { dictionary })}
                  disabled={busy !== null || claimed || locked}
                  {...(Object.keys(classNames).length === 0 ? {} : { classNames })}
                  {...(Object.keys(styles).length === 0 ? {} : { styles })}
                  onSubmit={(proof) => submit(spot.id, proof)}
                />
              </div>
            );
          });
          const props: SpotCardProps<TLocale> = {
            spot,
            state: currentState,
            status,
            ...(availabilityConfigured(config)
              ? {
                  availabilityStatus: evaluateSpotAvailability(spot.availability, availabilityNow)
                    .status,
                }
              : {}),
            locale,
            ...(dictionary === undefined ? {} : { dictionary }),
            children,
          };
          return (
            <div
              key={spot.id}
              className={join("sry-spot-card", classNames.card)}
              style={styles.card}
              data-status={status}
              aria-disabled={locked}
            >
              {renderSpotCard?.(props) ?? (
                <article>
                  {spot.iconUrl !== undefined && (
                    <img src={spot.iconUrl} alt="" width={32} height={32} />
                  )}
                  <h2>{resolveLocalizedText(spot.name, locale)}</h2>
                  {props.availabilityStatus !== undefined && (
                    <p role="status">
                      {availabilityText(dictionary, locale, props.availabilityStatus)}
                    </p>
                  )}
                  {spot.imageUrl !== undefined && <img src={spot.imageUrl} alt="" loading="lazy" />}
                  {spot.description !== undefined && (
                    <p>{resolveLocalizedText(spot.description, locale)}</p>
                  )}
                  {spot.hint !== undefined && <p>{resolveLocalizedText(spot.hint, locale)}</p>}
                  {spot.externalReferences !== undefined && spot.externalReferences.length > 0 && (
                    <span className={classNames.badge} style={styles.badge}>
                      {label(dictionary, locale, "externalReferences", "External references")} (
                      {spot.externalReferences.length})
                    </span>
                  )}
                  {renderStatusBadge?.({ status }) ?? (
                    <span className={classNames.badge} style={styles.badge}>
                      {label(dictionary, locale, `status.${status.toLowerCase()}`, status)}
                    </span>
                  )}
                  {locked && <p role="status">{lockedMessage}</p>}
                  {children}
                </article>
              )}
            </div>
          );
        };
        return (
          <>
            {(!progress.isCompleted || spots.length > 0) && (
              <section
                aria-label={label(
                  dictionary,
                  locale,
                  progress.isCompleted ? "moreToExplore" : "spots",
                  progress.isCompleted ? "More to explore" : "Spots",
                )}
              >
                {progress.isCompleted && (
                  <h2>{label(dictionary, locale, "moreToExplore", "More to explore")}</h2>
                )}
                {spots.map(renderSpot)}
              </section>
            )}
            {claimedSpots.length > 0 && (
              <details>
                <summary>
                  {label(dictionary, locale, "completedSpots", "Claimed spots")} (
                  {claimedSpots.length})
                </summary>
                <section aria-label={label(dictionary, locale, "completedSpots", "Claimed spots")}>
                  {claimedSpots.map(renderSpot)}
                </section>
              </details>
            )}
          </>
        );
      })()}
      <section aria-label={label(dictionary, locale, "rewards", "Rewards")}>
        {config.rewards.map((reward) => {
          const rewardProgress = calculateRewardProgress(reward.id, currentState, config) ?? {
            rewardId: reward.id,
            isUnlocked: false,
            acquired: 0,
            required: 0,
            percentage: 0,
            missingStampIds: [],
          };
          const props: RewardCardProps<TLocale> = {
            reward,
            state: currentState.rewards.find((item) => item.rewardId === reward.id),
            progress: rewardProgress,
            missingSpotIds: rewardProgress.missingStampIds,
            missingSpotNames: rewardProgress.missingStampIds
              .map((id) => config.spots.find((spot) => spot.id === id))
              .filter((spot): spot is PublicSpotItem<TLocale> => spot !== undefined)
              .map((spot) => resolveLocalizedText(spot.name, locale)),
            ...(currentState.inventory === undefined ? {} : { inventory: currentState.inventory }),
            locale,
            ...(dictionary === undefined ? {} : { dictionary }),
            ...(onViewReward === undefined ? {} : { onViewReward }),
            onClaim: claim,
          };
          return (
            <div key={reward.id} className={classNames.reward} style={styles.reward}>
              {renderRewardCard?.(props) ?? (
                <DefaultRewardCard {...props} classNames={classNames} styles={styles} />
              )}
            </div>
          );
        })}
      </section>
      <footer className={classNames.footer} style={styles.footer}>
        {footerSlot}
      </footer>
    </section>
  );
}

export interface StampSheetProps<TLocale extends string = string>
  extends RallyViewerSlots<TLocale> {
  readonly config: RallyConfig<TLocale>;
  readonly state?: StampRallyState | null;
  readonly title?: string;
  readonly progress?: StampRallyProgress;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly classNames?: ViewerClassNames;
  readonly styles?: ViewerStyles;
  readonly style?: ViewerStyle;
}
export function StampSheet<TLocale extends string = string>({
  config,
  state,
  title,
  progress,
  locale = "en" as TLocale,
  dictionary,
  classNames = {},
  styles = {},
  style,
  headerSlot,
  footerSlot,
  renderSpotCard,
  renderStatusBadge,
}: StampSheetProps<TLocale>): ReactElement {
  const currentState = state ?? {
    rallyId: config.id,
    userId: null,
    records: [],
    rewards: [],
    updatedAt: "",
  };
  const current = progress ?? calculateProgress(currentState, config);
  return (
    <section
      className={classNames.root}
      style={styles.root ?? style}
      aria-label={title ?? label(dictionary, locale, "stampSheet", "Stamp sheet")}
    >
      <header className={classNames.header} style={styles.header}>
        {typeof headerSlot === "function"
          ? headerSlot({ config, state: currentState })
          : (headerSlot ?? <h2>{title ?? resolveLocalizedText(config.title, locale)}</h2>)}
        <progress max={100} value={current.percentage} />
      </header>
      <div>
        {config.spots.map((spot) => {
          const status: SpotStatus = evaluateSpotStatus(spot, currentState);
          const props: SpotCardProps<TLocale> = {
            spot,
            state: currentState,
            status,
            locale,
            ...(dictionary === undefined ? {} : { dictionary }),
            children: (
              <span className={classNames.slot} style={styles.slot}>
                {status === "LOCKED"
                  ? label(dictionary, locale, "status.locked", "🔒 LOCKED")
                  : status === "CLAIMED"
                    ? label(dictionary, locale, "status.claimed", "CLAIMED")
                    : label(dictionary, locale, "status.unclaimed", "UNCLAIMED")}
              </span>
            ),
          };
          return (
            <div
              key={spot.id}
              className={classNames.card}
              style={styles.card}
              data-status={status}
              aria-disabled={status === "LOCKED"}
            >
              {renderSpotCard?.(props) ?? (
                <span className={classNames.slot} style={styles.slot}>
                  {spot.iconUrl !== undefined && (
                    <img src={spot.iconUrl} alt="" width={24} height={24} />
                  )}
                  {resolveLocalizedText(spot.name, locale)}{" "}
                  {spot.description !== undefined && (
                    <small>{resolveLocalizedText(spot.description, locale)}</small>
                  )}{" "}
                  {renderStatusBadge?.({ status }) ??
                    label(dictionary, locale, `status.${status.toLowerCase()}`, status)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <footer className={classNames.footer} style={styles.footer}>
        {footerSlot}
      </footer>
    </section>
  );
}
