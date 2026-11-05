import type {
  ClaimOptions,
  LocaleDictionary,
  PublicReward,
  RallyInventoryState,
  RewardState,
  StampRallyProgress,
} from "@stamprally/core";
import { getRewardAvailability, resolveLocalizedText } from "@stamprally/core";
import { type ReactElement, useRef, useState } from "react";
import { resolveUiLabel } from "../locales/index.js";
import { confirmReward } from "./confirmReward.js";

export interface CompletionPanelProps<TLocale extends string = string> {
  readonly progress: StampRallyProgress;
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly rewardStates: ReadonlyArray<RewardState>;
  readonly inventory?: RallyInventoryState;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onViewReward?: (rewardId: string) => void;
  readonly onClaimReward?: (rewardId: string, options?: ClaimOptions) => unknown;
  readonly className?: string;
}

export function CompletionPanel<TLocale extends string = string>({
  progress,
  rewards,
  rewardStates,
  inventory,
  locale,
  dictionary,
  onViewReward,
  onClaimReward,
  className,
}: CompletionPanelProps<TLocale>): ReactElement {
  const [claiming, setClaiming] = useState(false);
  const [claimFailed, setClaimFailed] = useState(false);
  const [staffCodes, setStaffCodes] = useState<Record<string, string>>({});
  const claimingRef = useRef(false);
  const availableRewards = rewards.filter((reward) => {
    const state = rewardStates.find((item) => item.rewardId === reward.id);
    return getRewardAvailability(reward, state, inventory).available;
  });
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
              {onViewReward !== undefined && reward.redemptionMethod === "view_only" && (
                <button type="button" onClick={() => onViewReward(reward.id)}>
                  {resolveUiLabel(dictionary, locale, "completion.viewReward", "View reward")}
                </button>
              )}
              {onClaimReward !== undefined && reward.redemptionMethod !== "view_only" && (
                <>
                  {reward.redemptionMethod === "staff_passcode" && (
                    <label>
                      {resolveUiLabel(
                        dictionary,
                        locale,
                        "redemption.staffPasscode",
                        "Staff passcode",
                      )}
                      <input
                        type="password"
                        autoComplete="off"
                        value={staffCodes[reward.id] ?? ""}
                        onChange={(event) =>
                          setStaffCodes({ ...staffCodes, [reward.id]: event.target.value })
                        }
                        disabled={claiming}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    disabled={
                      claiming ||
                      (reward.redemptionMethod === "staff_passcode" &&
                        !(staffCodes[reward.id] ?? "").trim())
                    }
                    onClick={() => {
                      if (
                        claimingRef.current ||
                        !confirmReward(
                          resolveLocalizedText(reward.title, locale),
                          locale,
                          dictionary,
                        )
                      )
                        return;
                      claimingRef.current = true;
                      setClaiming(true);
                      setClaimFailed(false);
                      const options =
                        reward.redemptionMethod === "staff_passcode"
                          ? { staffPasscode: (staffCodes[reward.id] ?? "").trim() }
                          : undefined;
                      void Promise.resolve()
                        .then(() =>
                          options === undefined
                            ? onClaimReward(reward.id)
                            : onClaimReward(reward.id, options),
                        )
                        .then((result) => {
                          if (
                            typeof result === "object" &&
                            result !== null &&
                            "ok" in result &&
                            result.ok === false
                          )
                            setClaimFailed(true);
                          else setStaffCodes((codes) => ({ ...codes, [reward.id]: "" }));
                        })
                        .catch(() => setClaimFailed(true))
                        .finally(() => {
                          claimingRef.current = false;
                          setClaiming(false);
                        });
                    }}
                  >
                    {resolveUiLabel(dictionary, locale, "reward.redeem", "Redeem reward")}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {claimFailed && (
        <p role="alert">
          {resolveUiLabel(
            dictionary,
            locale,
            "reward.claimFailed",
            "Could not redeem this reward. Please try again.",
          )}
        </p>
      )}
    </section>
  );
}
