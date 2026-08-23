import type { StampDefinition, StampRecord } from "@stamprally/core";

export type StampChannel = "instant" | "qr" | "nfc" | "geo";
export type StampInk = "vermilion" | "indigo";

export interface StampPresentation {
  readonly channel: StampChannel;
  readonly label: string;
  readonly icon: string;
  readonly ink: StampInk;
}

export interface StampSlotProps {
  readonly stamp: StampDefinition;
  readonly record: StampRecord | undefined;
  readonly isNext: boolean;
  readonly slotNumber: number;
  readonly presentation: StampPresentation;
  readonly isAnimating: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}

export function formatStampDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function StampSlot({
  stamp,
  record,
  isNext,
  slotNumber,
  presentation,
  isAnimating,
  disabled,
  onSelect,
}: StampSlotProps) {
  const status = record === undefined ? (isNext ? "available" : "locked") : "stamped";
  const number = `#${String(slotNumber).padStart(2, "0")}`;

  return (
    <button
      className={`stamp-slot stamp-slot--${status} stamp-slot--${presentation.ink}`}
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-label={`${number} ${stamp.name}、${
        status === "stamped" ? "取得済み" : status === "available" ? "取得可能" : "順序待ち"
      }、${presentation.label}`}
    >
      <span className="stamp-slot__topline">
        <span className="stamp-slot__number">{number}</span>
        <span className={`stamp-slot__state stamp-slot__state--${status}`}>
          {status === "stamped" ? "STAMPED" : status === "available" ? "NEXT" : "LOCKED"}
        </span>
      </span>

      <span className="stamp-slot__watermark" aria-hidden="true">
        {presentation.icon}
      </span>
      <span className="stamp-slot__name">{stamp.name}</span>
      <span className="stamp-slot__condition">
        <span aria-hidden="true">{presentation.icon}</span>
        {presentation.label}
      </span>

      {record !== undefined && (
        <span
          className={`stamp-imprint ${isAnimating ? "stamp-press" : ""}`}
          role="img"
          aria-label={`取得日時 ${formatStampDate(record.acquiredAt)}`}
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
