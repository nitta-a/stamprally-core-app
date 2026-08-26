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
  readonly channel?: "instant" | "qr" | "nfc" | "geo";
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
  readonly statusText?: string;
  readonly onSelect?: () => void;
}

const FONT_STACKS: Readonly<Record<NonNullable<SheetTheme["fontFamily"]>, string>> = {
  "system-ui": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", "Yu Mincho", serif',
  "rounded-sans": '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif',
  monospace: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
  handwritten: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
};

function formatStampDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  statusText,
  onSelect,
}: StampSlotProps) {
  const status = record === undefined ? (isNext ? "available" : "locked") : "stamped";
  const resolvedStatus = statusText ?? status;
  const statusSeparator = statusText !== undefined && locale === "ja" ? "、" : ", ";
  const name = resolveLocalizedText(stamp.name, locale);
  const label = presentation.label ?? stamp.condition.type;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-label={`#${String(slotNumber).padStart(2, "0")} ${name}${statusSeparator}${resolvedStatus}`}
      data-status={status}
      data-shape={slotShape}
      className={`stamp-slot stamp-slot--${status} stamp-slot--${presentation.ink ?? "vermilion"} stamp-slot--shape-${slotShape}${isAnimating ? " stamp-slot--animating" : ""}`}
      style={{ "--stamp-primary": "var(--stamprally-primary, #9e551e)" } as CSSProperties}
    >
      <span className="stamp-slot__topline">
        <span className="stamp-slot__number">#{String(slotNumber).padStart(2, "0")}</span>
        <span className={`stamp-slot__state stamp-slot__state--${status}`}>{resolvedStatus}</span>
      </span>
      <span className="stamp-slot__watermark" aria-hidden="true">
        {presentation.icon ?? "✦"}
      </span>
      <span className="stamp-slot__name">{name}</span>
      <span className="stamp-slot__condition">
        <span aria-hidden="true">{presentation.icon ?? "✦"}</span>
        {label}
      </span>
      {record !== undefined && (
        <span
          className={`stamp-imprint ${isAnimating ? "stamp-press" : ""}`}
          role="img"
          aria-label={`Acquired at ${formatStampDate(record.acquiredAt)}`}
        >
          <span className="stamp-imprint__inner">
            <span className="stamp-imprint__word">STAMP</span>
            <span className="stamp-imprint__date">{formatStampDate(record.acquiredAt)}</span>
          </span>
        </span>
      )}
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
    "--stamp-primary": `var(--stamprally-primary-override, ${theme.primaryColor})`,
    "--stamp-bg": `var(--stamprally-background-override, ${theme.backgroundColor ?? DEFAULT_SHEET_THEME.backgroundColor ?? "#ffffff"})`,
    "--stamp-card-bg": `var(--stamprally-card-override, ${theme.cardBackgroundColor})`,
    "--stamp-text": `var(--stamprally-text-override, ${theme.textColor})`,
    "--stamp-grid-cols": String(theme.gridColumns),
    "--stamp-grid-cols-mobile": String(Math.min(theme.gridColumns, 2)),
    "--stamp-unclaimed-opacity": String(theme.unclaimedOpacity ?? 1),
    "--stamp-font-family": FONT_STACKS[theme.fontFamily ?? "serif"],
    ...(theme.completedStampColor === undefined
      ? {}
      : { "--stamp-completed-color": theme.completedStampColor }),
    "--stamprally-primary": `var(--stamprally-primary-override, ${theme.primaryColor})`,
    "--stamprally-background": `var(--stamprally-background-override, ${theme.backgroundColor ?? "transparent"})`,
    "--stamprally-card": `var(--stamprally-card-override, ${theme.cardBackgroundColor})`,
    "--stamprally-text": `var(--stamprally-text-override, ${theme.textColor})`,
    "--stamprally-columns": String(theme.gridColumns),
  } as CSSProperties;
  const messages =
    locale === "en"
      ? {
          available: "available",
          locked: "locked",
          stamped: "stamped",
          remaining: (value: number) => `${value} spots remaining`,
          completed: "RALLY COMPLETED",
        }
      : {
          available: "取得可能",
          locked: "順序待ち",
          stamped: "取得済み",
          remaining: (value: number) => `あと${value}箇所`,
          completed: "ラリー達成",
        };
  return (
    <section
      className={`stamp-sheet ${percentage >= 100 ? "stamp-sheet--completed" : ""}`}
      style={style}
      aria-label={resolveLocalizedText(title, locale) || config.id}
    >
      <header className="stamp-sheet__header">
        <h2>{resolveLocalizedText(title, locale) || config.id}</h2>
        <span className="stamp-sheet__score" aria-live="polite">
          {count} / {total}
        </span>
      </header>
      <div className="stamp-sheet__progress-label">
        <span>{messages.remaining(Math.max(0, total - count))}</span>
        <strong>{Math.round(percentage)}%</strong>
      </div>
      <div
        className="stamp-sheet__progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        aria-label={locale === "en" ? "Rally progress" : "スタンプ取得進捗"}
      >
        <span
          className="stamp-sheet__progress-fill"
          style={{ display: "block", width: `${percentage}%` }}
        />
      </div>
      <div className="stamp-sheet__grid">
        {config.stamps.map((stamp, index) => {
          const recordForStamp = state?.records.find((record) => record.stampId === stamp.id);
          return (
            <StampSlot
              key={stamp.id}
              stamp={stamp}
              {...(recordForStamp === undefined ? {} : { record: recordForStamp })}
              isNext={next.has(stamp.id)}
              slotNumber={index + 1}
              {...(presentations[stamp.id] === undefined
                ? {}
                : { presentation: presentations[stamp.id] })}
              isAnimating={animatedStampId === stamp.id}
              disabled={disabled}
              slotShape={theme.slotShape}
              locale={locale}
              statusText={
                recordForStamp === undefined
                  ? next.has(stamp.id)
                    ? messages.available
                    : messages.locked
                  : messages.stamped
              }
              onSelect={() => onStampSelect?.(stamp.id)}
            />
          );
        })}
      </div>
      {percentage >= 100 && <div className="stamp-sheet__complete-mark">COMPLETE!!</div>}
      {percentage >= 100 && (
        <div className="stamp-sheet__complete-message">{messages.completed}</div>
      )}
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
