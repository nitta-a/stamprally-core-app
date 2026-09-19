import type {
  LocaleDictionary,
  PublicReward,
  RewardState,
  StampRallyProgress,
} from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import type { ReactElement } from "react";

export interface CompletionPanelProps<TLocale extends string = string> {
  readonly progress: StampRallyProgress;
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly rewardStates: ReadonlyArray<RewardState>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onClaimReward?: (rewardId: string) => void;
  readonly className?: string;
}

const label = <TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string => dictionary?.[locale]?.[key] ?? fallback;

export function CompletionPanel<TLocale extends string = string>({
  progress,
  rewards,
  rewardStates,
  locale,
  dictionary,
  onClaimReward,
  className,
}: CompletionPanelProps<TLocale>): ReactElement {
  const availableRewards = rewards.filter((reward) =>
    rewardStates.some((state) => state.rewardId === reward.id && state.status === "AVAILABLE"),
  );
  return (
    <section
      className={className}
      aria-live="polite"
      aria-label={label(dictionary, locale, "completion.title", "Rally complete")}
    >
      <h2>{label(dictionary, locale, "completion.title", "Stamp rally complete!")}</h2>
      <p>
        {label(
          dictionary,
          locale,
          "completion.description",
          "You completed {acquired} required spots.",
        ).replace("{acquired}", String(progress.completionRequired))}
      </p>
      {availableRewards.length > 0 && (
        <div>
          <p>{label(dictionary, locale, "completion.rewardAvailable", "A reward is available")}</p>
          {availableRewards.map((reward) => (
            <div key={reward.id}>
              <span>{resolveLocalizedText(reward.title, locale)}</span>
              {onClaimReward === undefined ? null : (
                <button type="button" onClick={() => onClaimReward(reward.id)}>
                  {label(dictionary, locale, "completion.viewReward", "View reward")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
