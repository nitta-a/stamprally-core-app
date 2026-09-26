import type {
  LocaleDictionary,
  PublicReward,
  RewardState,
  StampRallyProgress,
} from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import type { ReactElement } from "react";
import { resolveUiLabel } from "../locales/index.js";

export interface CompletionPanelProps<TLocale extends string = string> {
  readonly progress: StampRallyProgress;
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly rewardStates: ReadonlyArray<RewardState>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onViewReward?: (rewardId: string) => void;
  readonly onClaimReward?: (rewardId: string) => void;
  readonly className?: string;
}

export function CompletionPanel<TLocale extends string = string>({
  progress,
  rewards,
  rewardStates,
  locale,
  dictionary,
  onViewReward,
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
      aria-label={resolveUiLabel(dictionary, locale, "completion.title", "Rally complete")}
    >
      <h2>{resolveUiLabel(dictionary, locale, "completion.title", "Stamp rally complete!")}</h2>
      <p>
        {resolveUiLabel(
          dictionary,
          locale,
          "completion.description",
          "You completed {acquired} required spots.",
        ).replace("{acquired}", String(progress.completionRequired))}
      </p>
      {availableRewards.length > 0 && (
        <div>
          <p>
            {resolveUiLabel(
              dictionary,
              locale,
              "completion.rewardAvailable",
              "A reward is available",
            )}
          </p>
          {availableRewards.map((reward) => (
            <div key={reward.id}>
              <span>{resolveLocalizedText(reward.title, locale)}</span>
              {onViewReward !== undefined && (
                <button type="button" onClick={() => onViewReward(reward.id)}>
                  {resolveUiLabel(dictionary, locale, "completion.viewReward", "View reward")}
                </button>
              )}
              {onClaimReward !== undefined && reward.redemptionMethod !== "view_only" && (
                <button type="button" onClick={() => onClaimReward(reward.id)}>
                  {resolveUiLabel(dictionary, locale, "reward.redeem", "Redeem reward")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
