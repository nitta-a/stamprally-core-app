import { resolveLocalizedText } from "@stamprally/core";
import type { RewardCardProps } from "@stamprally/ui";
import type { ReactElement } from "react";
import { text } from "./locale.js";

interface DemoRewardCardProps extends RewardCardProps {
  anchorId: string;
}

export function DemoRewardCard(props: DemoRewardCardProps): ReactElement {
  const { reward, state, progress, locale, onViewReward, anchorId } = props;
  const language = locale === "ja" ? "ja" : "en";
  const available = state?.status === "AVAILABLE";
  let actionText = text(
    language,
    `あと${Math.max(0, progress.required - progress.acquired)}個で達成`,
    `${Math.max(0, progress.required - progress.acquired)} more to go`,
  );
  if (available) actionText = text(language, "記念カードを見る", "View keepsake");
  else if (state?.status === "CONSUMED") actionText = text(language, "受け取り済み", "Redeemed");
  else if (state?.status === "EXPIRED") actionText = text(language, "有効期限終了", "Expired");

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
        <button
          type="button"
          className="primary-button"
          disabled={!available || onViewReward === undefined}
          onClick={() => {
            onViewReward?.(reward.id);
          }}
        >
          {actionText}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  );
}
