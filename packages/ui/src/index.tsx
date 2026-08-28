import type {
  CheckInOptions,
  CheckInResult,
  ClaimOptions,
  ClaimResult,
  LocaleDictionary,
  PublicCheckInCondition,
  PublicRallyConfig,
  PublicSpotItem,
  RallyConfig,
  Reward,
  RewardState,
  StampRallyClient,
  StampRallyProgress,
  StampRallyState,
  UserRallyState,
} from "@stamprally/core";
import {
  calculateProgress,
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
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface ConditionRendererProps<TLocale extends string = string> {
  readonly spot: PublicSpotItem<TLocale>;
  readonly condition: PublicCheckInCondition;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly disabled: boolean;
  // biome-ignore lint/suspicious/noConfusingVoidType: custom renderers may fire-and-forget while built-ins await feedback.
  readonly onSubmit: (proof: unknown) => void | Promise<unknown>;
}
export type ConditionRenderer<TLocale extends string = string> = ComponentType<
  ConditionRendererProps<TLocale>
>;
export type ViewerClassName = "root" | "condition" | "action" | "feedback" | "reward";
export type ViewerStyle = CSSProperties & {
  readonly [key: `--${string}`]: string | number | undefined;
};

export interface RallyViewerAdapter<TLocale extends string = string> {
  readonly config: PublicRallyConfig<TLocale>;
  readonly onCheckIn: (
    spotId: string,
    proof: unknown,
    options?: CheckInOptions,
  ) => Promise<CheckInResult>;
  readonly onClaimReward?: (rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>;
}
export interface RallyViewerProps<TLocale extends string = string> {
  readonly config?: PublicRallyConfig<TLocale>;
  readonly client?: StampRallyClient;
  readonly adapter?: RallyViewerAdapter<TLocale>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly classNames?: Partial<Record<ViewerClassName, string>>;
  readonly style?: ViewerStyle;
  readonly customConditionRenderers?: Partial<
    Record<PublicCheckInCondition["type"], ConditionRenderer<TLocale>>
  >;
}

const label = <TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string => dictionary?.[locale]?.[key] ?? fallback;

type VerificationStatus = "idle" | "loading" | "success" | "error";

function DefaultCondition<TLocale extends string>({
  condition,
  dictionary,
  locale,
  disabled,
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
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (condition.type === "gps") return;
    if (condition.type === "nfc") return;
    void verify(condition.type === "passcode" ? value : value);
  };
  const scanQr = (): void => {
    if (videoRef.current === null) return;
    setStatus("loading");
    setError(null);
    void readQrContext(videoRef.current).then((result) => {
      if (result.ok) void verify(result.value);
      else {
        setStatus("error");
        setError(result.error.message);
      }
    });
  };
  const readLocation = (): void => {
    setStatus("loading");
    setError(null);
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
    setError(null);
    void readNfcContext().then((result) => {
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
            className="sry-action"
            disabled={disabled || !isQrSupported()}
            onClick={scanQr}
          >
            {text("scanQr", "Scan QR")}
          </button>
        </>
      )}
      {condition.type === "gps" && (
        <button type="button" className="sry-action" disabled={disabled} onClick={readLocation}>
          {text("checkLocation", "Check location")}
        </button>
      )}
      {condition.type === "nfc" && (
        <button
          type="button"
          className="sry-action"
          disabled={disabled || !isNfcSupported()}
          onClick={readNfc}
        >
          {text("readNfc", "Read NFC")}
        </button>
      )}
      {(condition.type === "passcode" ||
        condition.type === "custom" ||
        condition.type === "qr") && (
        <form onSubmit={submit}>
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
          <button type="submit" className="sry-action" disabled={disabled || value.trim() === ""}>
            {text("checkIn", "Check in")}
          </button>
        </form>
      )}
      <div
        className="sry-feedback"
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

export function RallyViewer<TLocale extends string = string>({
  config: providedConfig,
  client,
  adapter,
  locale,
  dictionary,
  classNames = {},
  style,
  customConditionRenderers = {},
}: RallyViewerProps<TLocale>): ReactElement {
  const config = providedConfig ?? client?.getConfig() ?? adapter?.config;
  const [state, setState] = useState<UserRallyState | null>(() => client?.getState() ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (client === undefined) return;
    const unsubscribe = client.subscribe(setState);
    void client.init().then(setState);
    return unsubscribe;
  }, [client]);
  if (config === undefined) throw new Error("RallyViewer requires config, client, or adapter.");
  const progress = useMemo<StampRallyProgress>(
    () =>
      calculateProgress(
        state ?? { rallyId: config.id, userId: null, records: [], rewards: [], updatedAt: "" },
        config,
      ),
    [config, state],
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
    (spotId: string, proof: unknown): Promise<CheckInResult | undefined> => {
      if (checkIn === undefined) return Promise.resolve(undefined);
      setBusy(spotId);
      return checkIn(spotId, proof).finally(() => setBusy(null));
    },
    [checkIn],
  );
  return (
    <section
      className={classNames.root}
      style={style}
      aria-label={label(dictionary, locale, "viewer", "Stamp rally")}
    >
      <h1>{resolveLocalizedText(config.title, locale) || config.id}</h1>
      <progress
        aria-label={label(dictionary, locale, "progress", "Progress")}
        max={100}
        value={progress.percentage}
      />{" "}
      <span>
        {progress.acquired}/{progress.total}
      </span>
      <div>
        {config.spots.map((spot) =>
          spot.conditions.map((condition) => {
            const Renderer = customConditionRenderers[condition.type] ?? DefaultCondition;
            return (
              <article
                className={classNames.condition}
                key={`${spot.id}-${condition.type}-${JSON.stringify(condition)}`}
              >
                <h2>{resolveLocalizedText(spot.name, locale)}</h2>
                <Renderer
                  spot={spot}
                  condition={condition}
                  locale={locale}
                  {...(dictionary === undefined ? {} : { dictionary })}
                  disabled={busy !== null}
                  onSubmit={(proof) => submit(spot.id, proof)}
                />
              </article>
            );
          }),
        )}
      </div>
      <section aria-label={label(dictionary, locale, "rewards", "Rewards")}>
        {config.rewards.map((reward) => (
          <RewardButton
            key={reward.id}
            reward={reward}
            state={state?.rewards.find((item) => item.rewardId === reward.id)}
            locale={locale}
            {...(dictionary === undefined ? {} : { dictionary })}
            {...(classNames.reward === undefined ? {} : { className: classNames.reward })}
            onClaim={claim}
          />
        ))}
      </section>
    </section>
  );
}

function RewardButton<TLocale extends string>({
  reward,
  state,
  locale,
  dictionary,
  className,
  onClaim,
}: {
  readonly reward: Reward<TLocale>;
  readonly state: RewardState | undefined;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly className?: string;
  readonly onClaim:
    | ((rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>)
    | undefined;
}): ReactElement {
  const status = state?.status ?? "LOCKED";
  return (
    <button
      type="button"
      className={className}
      disabled={status !== "AVAILABLE" || onClaim === undefined}
      onClick={() => {
        if (onClaim !== undefined) void onClaim(reward.id);
      }}
    >
      {resolveLocalizedText(reward.title, locale)} (
      {label(dictionary, locale, `status.${status.toLowerCase()}`, status)})
    </button>
  );
}

export interface StampSheetProps<TLocale extends string = string> {
  readonly config: RallyConfig<TLocale>;
  readonly state?: StampRallyState | null;
  readonly title?: string;
  readonly progress?: StampRallyProgress;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
}
export function StampSheet<TLocale extends string = string>({
  config,
  state,
  title,
  progress,
  locale = "en" as TLocale,
  dictionary,
}: StampSheetProps<TLocale>): ReactElement {
  const current =
    progress ??
    calculateProgress(
      state ?? { rallyId: config.id, userId: null, records: [], rewards: [], updatedAt: "" },
      config,
    );
  return (
    <section aria-label={title ?? label(dictionary, locale, "stampSheet", "Stamp sheet")}>
      <h2>{title ?? resolveLocalizedText(config.title, locale)}</h2>
      <progress max={100} value={current.percentage} />
      <div>
        {config.spots.map((spot) => (
          <span key={spot.id}>
            {state?.records.some((record) => record.stampId === spot.id) ? "✓" : "○"}
          </span>
        ))}
      </div>
    </section>
  );
}
