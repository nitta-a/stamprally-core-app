import {
  type ConsumeResult,
  DEFAULT_SHEET_THEME,
  type LocalizedText,
  type RallyConfig,
  type RewardItem,
  type RewardState,
  resolveLocalizedText,
  type SheetTheme,
  type SlotShape,
  type SpotItem,
  type StampRallyProgress,
  type StampRallyState,
  type SupportedLocale,
  type VerificationContext,
} from "@stamprally/core";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState } from "react";

export interface StampPresentation {
  readonly label?: string;
  readonly icon?: string;
  readonly ink?: "vermilion" | "indigo";
}

export interface StampSlotProps {
  readonly stamp: SpotItem;
  readonly record?: StampRallyState["records"][number] | undefined;
  readonly isNext?: boolean;
  readonly slotNumber?: number;
  readonly presentation?: StampPresentation | undefined;
  readonly isAnimating?: boolean;
  readonly disabled?: boolean;
  readonly slotShape?: SlotShape;
  readonly locale?: SupportedLocale;
  readonly onSelect?: () => void;
}

export function StampSlot({
  stamp,
  record,
  isNext = false,
  slotNumber = 1,
  presentation = {},
  isAnimating = false,
  disabled = false,
  slotShape = "rounded",
  locale = "ja",
  onSelect,
}: StampSlotProps) {
  const status = record === undefined ? (isNext ? "available" : "locked") : "stamped";
  const name = resolveLocalizedText(stamp.name, locale);
  const label = presentation.label ?? stamp.condition.type;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-label={`${slotNumber}. ${name} (${status})`}
      data-status={status}
      data-shape={slotShape}
      className={`stamp-slot stamp-slot--${status}${isAnimating ? " stamp-slot--animating" : ""}`}
      style={{ "--stamp-primary": "var(--stamprally-primary, #9e551e)" } as CSSProperties}
    >
      <span aria-hidden="true">{presentation.icon ?? "✦"}</span>
      <strong>{name}</strong>
      <small>{label}</small>
      {record !== undefined && <time dateTime={record.acquiredAt}>{record.acquiredAt}</time>}
    </button>
  );
}

export interface StampSheetProps {
  readonly title?: LocalizedText;
  readonly config: RallyConfig;
  readonly state?: StampRallyState | null;
  readonly progress?: StampRallyProgress;
  readonly presentations?: Readonly<Record<string, StampPresentation>>;
  readonly animatedStampId?: string | null;
  readonly disabled?: boolean;
  readonly locale?: SupportedLocale;
  readonly theme?: SheetTheme;
  readonly onStampSelect?: (stampId: string) => void;
}

export function StampSheet({
  title,
  config,
  state = null,
  progress,
  presentations = {},
  animatedStampId = null,
  disabled = false,
  locale = "ja",
  theme = config.theme ?? DEFAULT_SHEET_THEME,
  onStampSelect,
}: StampSheetProps) {
  const acquired = new Set(state?.records.map((record) => record.stampId) ?? []);
  const next = new Set(progress?.nextAvailableStamps.map((stamp) => stamp.id) ?? []);
  const count = progress?.acquired ?? acquired.size;
  const total = progress?.total ?? config.stamps.length;
  const percentage = progress?.percentage ?? (total === 0 ? 0 : (count / total) * 100);
  const style = {
    "--stamprally-primary": theme.primaryColor,
    "--stamprally-background": theme.backgroundColor ?? "transparent",
    "--stamprally-card": theme.cardBackgroundColor,
    "--stamprally-text": theme.textColor,
    "--stamprally-columns": String(theme.gridColumns),
  } as CSSProperties;
  return (
    <section
      className="stamprally-sheet"
      style={style}
      aria-label={resolveLocalizedText(title, locale) || config.id}
    >
      <header>
        <h2>{resolveLocalizedText(title, locale) || config.id}</h2>
        <span aria-live="polite">
          {count} / {total}
        </span>
      </header>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        aria-label="Rally progress"
      >
        <span style={{ display: "block", width: `${percentage}%` }} />
      </div>
      <div className="stamprally-sheet__grid">
        {config.stamps.map((stamp, index) => (
          <StampSlot
            key={stamp.id}
            stamp={stamp}
            {...(state?.records.find((record) => record.stampId === stamp.id) === undefined
              ? {}
              : { record: state?.records.find((record) => record.stampId === stamp.id) })}
            isNext={next.has(stamp.id)}
            slotNumber={index + 1}
            {...(presentations[stamp.id] === undefined
              ? {}
              : { presentation: presentations[stamp.id] })}
            isAnimating={animatedStampId === stamp.id}
            disabled={disabled}
            slotShape={theme.slotShape}
            locale={locale}
            onSelect={() => onStampSelect?.(stamp.id)}
          />
        ))}
      </div>
    </section>
  );
}

export interface AcquisitionFeedback {
  readonly ok: boolean;
  readonly message: string;
}
export interface StampModalProps {
  readonly open: boolean;
  readonly stamp: SpotItem | null;
  readonly record?: StampRallyState["records"][number] | undefined;
  readonly presentation?: StampPresentation | null;
  readonly requiredStampName?: string | null;
  readonly isAvailable?: boolean;
  readonly isPending?: boolean;
  readonly isCompleted?: boolean;
  readonly locale?: SupportedLocale;
  readonly onClose: () => void;
  readonly onAcquire?: (
    stampId: string,
    context: VerificationContext,
  ) => Promise<AcquisitionFeedback>;
  readonly onCheckIn?: (
    stampId: string,
    context: VerificationContext,
  ) => Promise<AcquisitionFeedback>;
  readonly onNotify?: (feedback: AcquisitionFeedback) => void;
}

export function StampModal({
  open,
  stamp,
  record,
  isAvailable = true,
  isPending = false,
  locale = "ja",
  onClose,
  onAcquire,
  onCheckIn,
  onNotify,
}: StampModalProps) {
  const [token, setToken] = useState("");
  useEffect(() => {
    if (!open) setToken("");
  }, [open]);
  if (!open || stamp === null) return null;
  const submit = async (context: VerificationContext): Promise<void> => {
    if (!isAvailable || record !== undefined) return;
    const handler = onAcquire ?? onCheckIn;
    if (handler === undefined) return;
    const feedback = await handler(stamp.id, context);
    onNotify?.(feedback);
    if (feedback.ok) onClose();
  };
  const name = resolveLocalizedText(stamp.name, locale);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stamprally-modal-title"
      className="stamprally-modal"
    >
      <div className="stamprally-modal__panel">
        <button type="button" aria-label="Close" onClick={onClose} disabled={isPending}>
          ×
        </button>
        <h2 id="stamprally-modal-title">{name}</h2>
        {record !== undefined ? (
          <p>Already claimed.</p>
        ) : (
          <p>{resolveLocalizedText(stamp.description, locale)}</p>
        )}
        {stamp.condition.type === "token" ? (
          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void submit({ type: "token", token });
            }}
          >
            <label>
              Passcode <input value={token} onChange={(event) => setToken(event.target.value)} />
            </label>
            <button type="submit" disabled={!isAvailable || isPending}>
              Claim stamp
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => void submit({ type: "instant" })}
            disabled={!isAvailable || isPending}
          >
            Claim stamp
          </button>
        )}
      </div>
    </div>
  );
}

export interface RewardPanelProps {
  readonly rewards: ReadonlyArray<RewardItem>;
  readonly states: ReadonlyArray<RewardState>;
  readonly locale?: SupportedLocale;
  readonly isPending?: boolean;
  readonly onRedeem: (
    rewardId: string,
    options?: { readonly passcode?: string; readonly staffId?: string },
  ) => Promise<ConsumeResult>;
  readonly onNotify?: (ok: boolean, message: string) => void;
}

export function RewardPanel({
  rewards,
  states,
  locale = "ja",
  isPending = false,
  onRedeem,
  onNotify,
}: RewardPanelProps) {
  const [passcodes, setPasscodes] = useState<Readonly<Record<string, string>>>({});
  return (
    <section aria-labelledby="stamprally-rewards-title" className="stamprally-rewards">
      <h2 id="stamprally-rewards-title">Rewards</h2>
      {rewards.map((reward) => {
        const state = states.find((item) => item.rewardId === reward.id);
        const available = state?.status === "AVAILABLE";
        const redeem = async (options?: { readonly passcode?: string }): Promise<void> => {
          const result = await onRedeem(reward.id, options);
          onNotify?.(result.ok, result.ok ? "Reward claimed." : result.error.code);
        };
        return (
          <article
            key={reward.id}
            className={`stamprally-reward stamprally-reward--${state?.status ?? "LOCKED"}`}
          >
            <h3>{resolveLocalizedText(reward.title, locale)}</h3>
            <p>{resolveLocalizedText(reward.description, locale)}</p>
            <span>{state?.status ?? "LOCKED"}</span>
            {reward.redemptionMethod === "staff_passcode" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void redeem({ passcode: passcodes[reward.id] ?? "" });
                }}
              >
                <label>
                  Staff passcode{" "}
                  <input
                    type="password"
                    value={passcodes[reward.id] ?? ""}
                    onChange={(event) =>
                      setPasscodes((current) => ({ ...current, [reward.id]: event.target.value }))
                    }
                  />
                </label>
                <button type="submit" disabled={!available || isPending}>
                  Redeem
                </button>
              </form>
            )}
            {reward.redemptionMethod !== "staff_passcode" && (
              <button
                type="button"
                disabled={!available || isPending}
                onClick={() => void redeem()}
              >
                Redeem
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
