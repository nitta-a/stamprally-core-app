"use client";

import type {
  CheckInOptions,
  CheckInResult,
  ClaimOptions,
  ClaimResult,
  SpotStatus as CoreSpotStatus,
  LocaleDictionary,
  PublicCheckInCondition,
  PublicRallyConfig,
  PublicReward,
  PublicSpotItem,
  RallyConfig,
  RallyInventoryState,
  RewardState,
  StampRallyClient,
  StampRallyProgress,
  StampRallyState,
  SyncEventListener,
  UserRallyState,
} from "@stamprally/core";
import { type SyncStateContext, SyncStatusBanner } from "./components/SyncStatusBanner.js";
import { DEFAULT_UI_DICTIONARY } from "./locales/index.js";

export type { SyncStateContext, SyncStatusBannerProps } from "./components/SyncStatusBanner.js";
export { SyncStatusBanner } from "./components/SyncStatusBanner.js";

export { DEFAULT_UI_DICTIONARY, UI_DICTIONARIES } from "./locales/index.js";

import {
  calculateProgress,
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
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly children: ReactNode;
}
export interface RewardCardProps<TLocale extends string = string> {
  readonly reward: PublicReward<TLocale>;
  readonly state: RewardState | undefined;
  readonly inventory?: RallyInventoryState;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
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
}

export interface RallyViewerAdapter<TLocale extends string = string> {
  readonly config: PublicRallyConfig<TLocale>;
  readonly onCheckIn: (
    spotId: string,
    proof: unknown,
    options?: CheckInOptions,
  ) => Promise<CheckInResult>;
  readonly onClaimReward?: (rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>;
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
}

const label = <TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string =>
  dictionary?.[locale]?.[key] ?? DEFAULT_UI_DICTIONARY[locale as "ja" | "en"]?.[key] ?? fallback;
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
          <label>
            {text("qrValue", "QR value")}
            <input
              aria-label={text("qrValue", "QR value")}
              placeholder={condition.qrEntryUrl ?? text("qrPlaceholder", "Paste a QR value")}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
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
      {(condition.type === "passcode" ||
        condition.type === "custom" ||
        condition.type === "qr") && (
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
              aria-label={text("proof", "Proof")}
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
        {status === "success" && text("verified", "Verified")}
        {status === "error" && (error ?? text("verificationFailed", "Verification failed."))}
      </div>
    </div>
  );
}

function DefaultRewardCard<TLocale extends string>({
  reward,
  state,
  inventory,
  locale,
  dictionary,
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
  const unavailable =
    status !== "AVAILABLE" ||
    onClaim === undefined ||
    sharedRemaining === 0 ||
    configuredRemaining === 0;
  const expiry = reward.validUntil === undefined ? undefined : new Date(reward.validUntil);
  return (
    <article className={classNames?.reward} style={styles?.reward}>
      <h3>{resolveLocalizedText(reward.title, locale)}</h3>
      {reward.description !== undefined && (
        <p>{resolveLocalizedText(reward.description, locale)}</p>
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
          if (onClaim !== undefined) void onClaim(reward.id);
        }}
      >
        {label(dictionary, locale, `status.${status.toLowerCase()}`, status)}
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
  renderSyncStatus,
  showSyncStatus = true,
}: RallyViewerProps<TLocale>): ReactElement {
  const config = providedConfig ?? client?.getConfig() ?? adapter?.config;
  const [state, setState] = useState<UserRallyState | null>(() => client?.getState() ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CheckInResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStateContext>(() => ({
    syncState: client?.syncState ?? "idle",
    isSyncing: client?.syncState === "syncing",
    pendingCount: client?.pendingCount ?? 0,
    rejectedHistory: client?.rejectedHistory ?? [],
    storageCapability: client?.storageCapability ?? "custom",
    isStoragePersistent: client?.isStoragePersistent ?? true,
  }));
  useEffect(() => {
    if (client === undefined) return;
    const unsubscribe = client.subscribe(setState);
    void client.init().then(setState);
    return unsubscribe;
  }, [client]);
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
      return result;
    },
    [checkIn, config.spots, currentState],
  );
  return (
    <section
      className={classNames.root}
      style={styles.root ?? style}
      aria-label={label(dictionary, locale, "viewer", "Stamp rally")}
    >
      <header className={classNames.header} style={styles.header}>
        {typeof headerSlot === "function"
          ? headerSlot({ config, state: currentState })
          : headerSlot}
        {headerSlot === undefined && (
          <h1>{resolveLocalizedText(config.title, locale) || config.id}</h1>
        )}
        <progress
          aria-label={label(dictionary, locale, "progress", "Progress")}
          max={100}
          value={progress.percentage}
        />
        <span>
          {progress.acquired}/{progress.total}
        </span>
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
            {label(dictionary, locale, "verified", "Verified")}
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
      <div>
        {config.spots.map((spot) => {
          const status: SpotStatus =
            busy === spot.id ? "VERIFYING" : evaluateSpotStatus(spot, currentState);
          const claimed = status === "CLAIMED";
          const locked = status === "LOCKED";
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
            locale,
            ...(dictionary === undefined ? {} : { dictionary }),
            children,
          };
          return (
            <div
              key={spot.id}
              className={classNames.card}
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
                  {locked && (
                    <p role="status">
                      {label(
                        dictionary,
                        locale,
                        "prerequisitesNotMet",
                        "Complete the prerequisite spots before checking in.",
                      )}
                    </p>
                  )}
                  {children}
                </article>
              )}
            </div>
          );
        })}
      </div>
      <section aria-label={label(dictionary, locale, "rewards", "Rewards")}>
        {config.rewards.map((reward) => {
          const props: RewardCardProps<TLocale> = {
            reward,
            state: currentState.rewards.find((item) => item.rewardId === reward.id),
            ...(currentState.inventory === undefined ? {} : { inventory: currentState.inventory }),
            locale,
            ...(dictionary === undefined ? {} : { dictionary }),
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
