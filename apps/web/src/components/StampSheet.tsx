import type {
  LocalizedText,
  RallyConfig,
  StampDefinition,
  StampRallyProgress,
  StampRallyState,
  SupportedLocale,
} from "@stamprally/core";
import { DEFAULT_SHEET_THEME, resolveLocalizedText } from "@stamprally/core";
import type { CSSProperties } from "react";
import { getMessages } from "../locales/index.js";
import { type StampPresentation, StampSlot } from "./StampSlot.js";
import "./StampSheet.css";

export interface StampSheetProps {
  readonly title: LocalizedText;
  readonly config: RallyConfig;
  readonly state: StampRallyState | null;
  readonly progress: StampRallyProgress;
  readonly presentations: Readonly<Record<string, StampPresentation>>;
  readonly animatedStampId: string | null;
  readonly disabled: boolean;
  readonly locale?: SupportedLocale;
  readonly onStampSelect: (stampId: string) => void;
}

function fallbackPresentation(stamp: StampDefinition): StampPresentation {
  switch (stamp.condition.type) {
    case "instant":
      return { channel: "instant", label: "Instant", icon: "⚡", ink: "vermilion" };
    case "geo":
      return { channel: "geo", label: "GPS", icon: "📍", ink: "vermilion" };
    case "token":
      return { channel: "qr", label: "Token", icon: "🔑", ink: "indigo" };
    case "composite":
    case "time_window":
      return { channel: "instant", label: "Special", icon: "✦", ink: "indigo" };
  }
}

export function StampSheet({
  title,
  config,
  state,
  progress,
  presentations,
  animatedStampId,
  disabled,
  locale = "ja",
  onStampSelect,
}: StampSheetProps) {
  const messages = getMessages(locale);
  const theme = config.theme ?? DEFAULT_SHEET_THEME;
  const records = new Map(state?.records.map((record) => [record.stampId, record]) ?? []);
  const nextIds = new Set(progress.nextAvailableStamps.map((stamp) => stamp.id));
  const backgroundImage =
    theme.backgroundImageUrl === undefined
      ? "none"
      : `url(${JSON.stringify(theme.backgroundImageUrl)})`;
  const themeStyles = {
    "--stamp-primary": theme.primaryColor,
    "--stamp-bg": theme.backgroundColor ?? DEFAULT_SHEET_THEME.backgroundColor ?? "#ffffff",
    "--stamp-card-bg": theme.cardBackgroundColor,
    "--stamp-text": theme.textColor,
    "--stamp-grid-cols": String(theme.gridColumns),
    "--stamp-grid-cols-mobile": String(Math.min(theme.gridColumns, 2)),
    "--stamp-unclaimed-opacity": String(theme.unclaimedOpacity ?? 1),
    "--stamp-background-image": backgroundImage,
    ...(theme.completedStampColor === undefined
      ? {}
      : { "--stamp-completed-color": theme.completedStampColor }),
  } as CSSProperties;

  return (
    <section
      className={`stamp-sheet ${progress.isCompleted ? "stamp-sheet--completed" : ""}`}
      style={themeStyles}
      data-grid-columns={theme.gridColumns}
    >
      <header className="stamp-sheet__header">
        <div>
          <p className="stamp-sheet__kicker">{messages.officialSheet}</p>
          <h2>{resolveLocalizedText(title, locale)}</h2>
        </div>
        <div className="stamp-sheet__score" aria-live="polite">
          <strong>
            {progress.acquired} / {progress.total}
          </strong>
          <span>{messages.stamps}</span>
        </div>
      </header>

      <div className="stamp-sheet__progress-label">
        <span>{messages.remaining(Math.max(0, progress.total - progress.acquired))}</span>
        <strong>{Math.round(progress.percentage)}%</strong>
      </div>
      <div
        className="stamp-sheet__progress-track"
        role="progressbar"
        aria-label={messages.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.percentage)}
      >
        <div className="stamp-sheet__progress-fill" style={{ width: `${progress.percentage}%` }} />
      </div>

      <div className="stamp-sheet__grid">
        {config.stamps.map((stamp, index) => (
          <StampSlot
            key={stamp.id}
            stamp={stamp}
            record={records.get(stamp.id)}
            isNext={nextIds.has(stamp.id)}
            slotNumber={index + 1}
            presentation={presentations[stamp.id] ?? fallbackPresentation(stamp)}
            isAnimating={animatedStampId === stamp.id && records.has(stamp.id)}
            disabled={disabled}
            slotShape={theme.slotShape}
            locale={locale}
            onSelect={() => onStampSelect(stamp.id)}
          />
        ))}
      </div>

      {progress.isCompleted && (
        <>
          <div className="stamp-sheet__complete-mark" aria-hidden="true">
            COMPLETE!!
          </div>
          <div className="stamp-sheet__complete-message" role="status">
            <span aria-hidden="true">🏅</span>
            <div>
              <strong>{messages.rallyCompleted}</strong>
              <span>{messages.congratulations}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
