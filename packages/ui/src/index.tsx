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
import { calculateProgress, resolveLocalizedText } from "@stamprally/core";
import {
  type ComponentType,
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface ConditionRendererProps<TLocale extends string = string> {
  readonly spot: PublicSpotItem<TLocale>;
  readonly condition: PublicCheckInCondition;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly disabled: boolean;
  readonly onSubmit: (proof: unknown) => void;
}
export type ConditionRenderer<TLocale extends string = string> = ComponentType<
  ConditionRendererProps<TLocale>
>;
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
  readonly customConditionRenderers?: Partial<
    Record<PublicCheckInCondition["type"], ConditionRenderer<TLocale>>
  >;
}
const label = (
  dictionary: LocaleDictionary<string> | undefined,
  locale: string,
  key: string,
  fallback: string,
): string => dictionary?.[locale]?.[key] ?? fallback;
function DefaultCondition<TLocale extends string>({
  condition,
  dictionary,
  locale,
  disabled,
  onSubmit,
}: ConditionRendererProps<TLocale>): ReactElement {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onSubmit(
      condition.type === "gps"
        ? { latitude: Number(value.split(",")[0]), longitude: Number(value.split(",")[1]) }
        : condition.type === "nfc"
          ? { tagId: value }
          : value,
    );
  };
  return (
    <form onSubmit={submit}>
      <label>
        {label(dictionary, locale, "proof", "Proof")}
        <input
          aria-label={label(dictionary, locale, "proof", "Proof")}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit" disabled={disabled}>
        {condition.type === "gps"
          ? label(dictionary, locale, "checkLocation", "Check location")
          : label(dictionary, locale, "checkIn", "Check in")}
      </button>
    </form>
  );
}
export function RallyViewer<TLocale extends string = string>({
  config: providedConfig,
  client,
  adapter,
  locale,
  dictionary,
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
    (spotId: string, proof: unknown) => {
      if (checkIn === undefined) return;
      setBusy(spotId);
      void checkIn(spotId, proof).finally(() => setBusy(null));
    },
    [checkIn],
  );
  return (
    <section aria-label={label(dictionary, locale, "viewer", "Stamp rally")}>
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
              <article key={`${spot.id}-${condition.type}-${JSON.stringify(condition)}`}>
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
            onClaim={claim}
          />
        ))}
      </section>
    </section>
  );
}
function RewardButton({
  reward,
  state,
  onClaim,
}: {
  readonly reward: Reward;
  readonly state: RewardState | undefined;
  readonly onClaim:
    | ((rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>)
    | undefined;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={state?.status !== "AVAILABLE" || onClaim === undefined}
      onClick={() => {
        if (onClaim !== undefined) void onClaim(reward.id);
      }}
    >
      {resolveLocalizedText(reward.title, "en")} ({state?.status ?? "LOCKED"})
    </button>
  );
}
export interface StampSheetProps<TLocale extends string = string> {
  readonly config: RallyConfig<TLocale>;
  readonly state?: StampRallyState | null;
  readonly title?: string;
  readonly progress?: StampRallyProgress;
  readonly locale?: TLocale;
}
export function StampSheet<TLocale extends string = string>({
  config,
  state,
  title,
  progress,
}: StampSheetProps<TLocale>): ReactElement {
  const current =
    progress ??
    calculateProgress(
      state ?? { rallyId: config.id, userId: null, records: [], rewards: [], updatedAt: "" },
      config,
    );
  return (
    <section aria-label={title ?? "Stamp sheet"}>
      <h2>{title ?? resolveLocalizedText(config.title, "en")}</h2>
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
