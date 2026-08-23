import type {
  RallyConfig,
  StampDefinition,
  StampRallyProgress,
  StampRallyState,
} from "@stamprally/core";
import { type StampPresentation, StampSlot } from "./StampSlot.js";
import "./StampSheet.css";

export interface StampSheetProps {
  readonly title: string;
  readonly config: RallyConfig;
  readonly state: StampRallyState | null;
  readonly progress: StampRallyProgress;
  readonly presentations: Readonly<Record<string, StampPresentation>>;
  readonly animatedStampId: string | null;
  readonly disabled: boolean;
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
  onStampSelect,
}: StampSheetProps) {
  const records = new Map(state?.records.map((record) => [record.stampId, record]) ?? []);
  const nextIds = new Set(progress.nextAvailableStamps.map((stamp) => stamp.id));

  return (
    <section className={`stamp-sheet ${progress.isCompleted ? "stamp-sheet--completed" : ""}`}>
      <header className="stamp-sheet__header">
        <div>
          <p className="stamp-sheet__kicker">Official collection sheet</p>
          <h2>{title}</h2>
        </div>
        <div className="stamp-sheet__score" aria-live="polite">
          <strong>
            {progress.acquired} / {progress.total}
          </strong>
          <span>STAMPS</span>
        </div>
      </header>

      <div className="stamp-sheet__progress-label">
        <span>Journey progress</span>
        <strong>{Math.round(progress.percentage)}%</strong>
      </div>
      <div
        className="stamp-sheet__progress-track"
        role="progressbar"
        aria-label="スタンプ取得進捗"
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
              <strong>RALLY COMPLETED</strong>
              <span>全チェックポイントを達成しました！</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
