import {
  type ConsumeResult,
  type RewardItem,
  type RewardState,
  resolveLocalizedText,
  type SupportedLocale,
} from "@stamprally/core";
import { type FormEvent, useState } from "react";
import { getMessages } from "../locales/index.js";

interface RewardPanelProps {
  readonly rewards: ReadonlyArray<RewardItem>;
  readonly states: ReadonlyArray<RewardState>;
  readonly locale: SupportedLocale;
  readonly isPending: boolean;
  readonly onRedeem: (
    rewardId: string,
    options?: { readonly passcode?: string; readonly staffId?: string },
  ) => Promise<ConsumeResult>;
  readonly onNotify: (ok: boolean, message: string) => void;
}

function rewardStatus(rewardId: string, states: ReadonlyArray<RewardState>): RewardState["status"] {
  return states.find((state) => state.rewardId === rewardId)?.status ?? "LOCKED";
}

export function RewardPanel({
  rewards,
  states,
  locale,
  isPending,
  onRedeem,
  onNotify,
}: RewardPanelProps) {
  const messages = getMessages(locale);
  const [passcodes, setPasscodes] = useState<Record<string, string>>({});
  const [slides, setSlides] = useState<Record<string, number>>({});

  async function redeem(reward: RewardItem, passcode?: string): Promise<void> {
    const result = await onRedeem(
      reward.id,
      passcode === undefined ? undefined : { passcode, staffId: "demo-staff" },
    );
    if (result.ok) {
      onNotify(true, messages.redeemed);
      setSlides((current) => ({ ...current, [reward.id]: 0 }));
      setPasscodes((current) => ({ ...current, [reward.id]: "" }));
    } else {
      const message =
        result.error.code === "INVALID_PASSCODE"
          ? messages.errorPasscode
          : result.error.code === "ALREADY_CONSUMED"
            ? messages.errorConsumed
            : messages.errorNotAvailable;
      onNotify(false, message);
    }
  }

  async function submitPasscode(event: FormEvent, reward: RewardItem): Promise<void> {
    event.preventDefault();
    await redeem(reward, passcodes[reward.id] ?? "");
  }

  return (
    <section className="reward-panel" aria-labelledby="reward-panel-title">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Benefits</p>
          <h2 id="reward-panel-title">{messages.rewards}</h2>
        </div>
        <p>{messages.rewardDescription}</p>
      </header>
      {rewards.length === 0 ? (
        <p>{messages.noRewards}</p>
      ) : (
        <div className="reward-grid">
          {rewards.map((reward) => {
            const status = rewardStatus(reward.id, states);
            const available = status === "AVAILABLE";
            const statusLabel =
              status === "CONSUMED"
                ? messages.consumed
                : status === "EXPIRED"
                  ? messages.expired
                  : available
                    ? messages.available
                    : messages.locked;
            return (
              <article
                className={`reward-card reward-card--${status.toLowerCase()}`}
                key={reward.id}
              >
                <header>
                  <span aria-hidden="true">{reward.type === "digital" ? "🎟️" : "🎁"}</span>
                  <span className="status-badge">{statusLabel}</span>
                </header>
                <h3>{resolveLocalizedText(reward.title, locale)}</h3>
                <p>{resolveLocalizedText(reward.description, locale)}</p>
                <small>{messages.requiredStamps(reward.requiredStampCount)}</small>

                {reward.redemptionMethod === "manual_slide" && status !== "CONSUMED" && (
                  <label className="redeem-slider">
                    {messages.slideToRedeem}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={slides[reward.id] ?? 0}
                      disabled={!available || isPending}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSlides((current) => ({ ...current, [reward.id]: value }));
                        if (value === 100) void redeem(reward);
                      }}
                    />
                  </label>
                )}

                {reward.redemptionMethod === "staff_passcode" && status !== "CONSUMED" && (
                  <form
                    className="reward-passcode"
                    onSubmit={(event) => void submitPasscode(event, reward)}
                  >
                    <label>
                      {messages.staffPasscode}
                      <input
                        type="password"
                        value={passcodes[reward.id] ?? ""}
                        disabled={!available || isPending}
                        onChange={(event) =>
                          setPasscodes((current) => ({
                            ...current,
                            [reward.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={!available || isPending}
                    >
                      {messages.redeem}
                    </button>
                  </form>
                )}

                {reward.redemptionMethod === "view_only" && (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!available || isPending}
                    onClick={() => void redeem(reward)}
                  >
                    {messages.viewReward}
                  </button>
                )}
                {status === "CONSUMED" && (
                  <strong className="reward-consumed">✓ {messages.consumed}</strong>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
