import { resolveLocalizedText } from "@stamprally/core";
import type { RewardCardProps } from "@stamprally/ui";
import type { ReactElement } from "react";
import { useState } from "react";
import { text } from "./locale.js";

interface DemoRewardCardProps extends RewardCardProps {
  anchorId: string;
}

export function DemoRewardCard(props: DemoRewardCardProps): ReactElement {
  const { reward, state, progress, missingSpotNames, locale, onViewReward, onClaim, anchorId } =
    props;
  const language = locale === "ja" ? "ja" : "en";
  const [staffCode, setStaffCode] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const available = state?.status === "AVAILABLE";
  const consumed = state?.status === "CONSUMED";
  const expired = state?.status === "EXPIRED";
  const isViewOnly = reward.redemptionMethod === "view_only";
  const requiresStaffCode = reward.redemptionMethod === "staff_passcode";
  const remainingCount = Math.max(0, progress.required - progress.acquired);

  let actionText =
    remainingCount > 0
      ? text(language, `あと${remainingCount}個で達成`, `${remainingCount} more to go`)
      : text(language, "条件を達成すると受け取れます", "Complete requirements to unlock");
  if (available) {
    if (isViewOnly) actionText = text(language, "記念カードを見る", "View keepsake");
    else if (reward.redemptionMethod === "manual_slide")
      actionText = text(language, "確認して特典を受け取る", "Confirm and receive reward");
    else actionText = text(language, "特典を受け取る", "Receive reward");
  } else if (consumed) {
    actionText = text(language, "受け取り済み", "Redeemed");
  } else if (expired) {
    actionText = text(language, "有効期限終了", "Expired");
  }

  const handleClaim = async (): Promise<void> => {
    if (onClaim === undefined) return;
    setClaimError(null);
    setIsClaiming(true);
    try {
      const result = await onClaim(
        reward.id,
        requiresStaffCode ? { staffPasscode: staffCode.trim() } : undefined,
      );
      if (!result.ok) {
        setClaimError(
          text(
            language,
            requiresStaffCode
              ? "スタッフ確認用コードを確認して、もう一度お試しください。"
              : "特典を受け取れませんでした。条件を確認してください。",
            requiresStaffCode
              ? "That staff passcode did not work. Please try again."
              : "Could not redeem this reward. Please check the requirements.",
          ),
        );
      }
    } catch {
      setClaimError(
        text(language, "特典を受け取れませんでした。", "Could not redeem this reward."),
      );
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <article className="walk-reward" id={anchorId}>
      <div className="reward-art" aria-hidden="true">
        <span>✳</span>
        <small>
          GOOD WALKS,
          <br />
          GOOD MEMORIES.
        </small>
      </div>
      <div className="walk-reward__body">
        <span className="eyebrow">
          {text(language, "歩いた先の、小さなごほうび", "A little reward for the journey")}
        </span>
        <h2>{resolveLocalizedText(reward.title, locale)}</h2>
        <p>
          {resolveLocalizedText(
            reward.description ??
              text(
                language,
                "街で集めた思い出を記念に。",
                "A keepsake for the memories you made along the way.",
              ),
            locale,
          )}
        </p>
        <span className="reward-requirement">
          {text(
            language,
            `スタンプ ${progress.acquired} / ${progress.required} 個`,
            `${progress.acquired} / ${progress.required} stamps`,
          )}
        </span>
        {!progress.isUnlocked && missingSpotNames.length > 0 && (
          <p className="reward-missing-spots">
            {text(
              language,
              `必要なスポット: ${missingSpotNames.join("・")}`,
              `Required places: ${missingSpotNames.join(", ")}`,
            )}
          </p>
        )}
        {consumed && state?.claimTicketNumber !== undefined && (
          <p className="reward-ticket" role="status">
            {text(
              language,
              `引換番号: ${state.claimTicketNumber}`,
              `Ticket number: ${state.claimTicketNumber}`,
            )}
          </p>
        )}
        {available && requiresStaffCode ? (
          <form
            className="spot-checkin"
            onSubmit={(event) => {
              event.preventDefault();
              void handleClaim();
            }}
          >
            <label>
              <span>{text(language, "スタッフ確認用コード", "Staff passcode")}</span>
              <input
                aria-label={text(
                  language,
                  `${resolveLocalizedText(reward.title, locale)}のスタッフ確認用コード`,
                  `Staff passcode for ${resolveLocalizedText(reward.title, locale)}`,
                )}
                value={staffCode}
                onChange={(event) => setStaffCode(event.target.value)}
                disabled={isClaiming}
                placeholder={text(language, "スタッフコードを入力", "Enter staff passcode")}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={isClaiming || onClaim === undefined || staffCode.trim() === ""}
            >
              {actionText}
              <span aria-hidden="true">↗</span>
            </button>
            {claimError !== null && (
              <p role="alert" className="checkin-error">
                {claimError}
              </p>
            )}
          </form>
        ) : (
          <>
            <button
              type="button"
              className="primary-button"
              disabled={
                !available ||
                isClaiming ||
                (isViewOnly ? onViewReward === undefined : onClaim === undefined)
              }
              onClick={() => {
                if (isViewOnly) onViewReward?.(reward.id);
                else void handleClaim();
              }}
            >
              {actionText}
              <span aria-hidden="true">↗</span>
            </button>
            {claimError !== null && (
              <p role="alert" className="checkin-error">
                {claimError}
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
