import { resolveLocalizedText } from "@stamprally/core";
import type { ConditionRendererProps, SpotCardProps } from "@stamprally/ui";
import { formatAvailabilityDetail } from "@stamprally/ui";
import type { ReactElement } from "react";
import { useState } from "react";
import { DEMO_STOPS } from "./demoConfig.js";
import type { DemoLocale } from "./locale.js";
import { text } from "./locale.js";

function formatAcquiredTime(timestamp: string | undefined, locale: DemoLocale): string | null {
  if (timestamp === undefined || timestamp === "") return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString(locale === "ja" ? "ja-JP" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function DemoSpotCard(props: SpotCardProps): ReactElement {
  const { spot, state, status, availability, locale, children, prerequisiteNames = [] } = props;
  const stop = DEMO_STOPS[spot.id];
  const language = locale === "ja" ? "ja" : "en";
  const name = resolveLocalizedText(spot.name, locale);
  const claimed = status === "CLAIMED";
  const locked = status === "LOCKED";
  let statusText = text(language, "スタンプ未獲得", "Not collected");
  if (claimed) statusText = text(language, "獲得済み", "Collected");
  else if (locked) statusText = text(language, "前提スポットが必要", "Prerequisite required");
  else if (status === "VERIFYING") statusText = text(language, "確認中…", "Checking…");
  const record = state.records.find((item) => item.stampId === spot.id);
  const acquiredTime = formatAcquiredTime(record?.acquiredAt, language);
  const availabilityDetail = formatAvailabilityDetail(
    availability,
    language,
    spot.availability?.timezone ?? "UTC",
  );

  return (
    <article className="walk-spot" id={`spot-${spot.id}`} aria-label={name} tabIndex={-1}>
      <div className={`spot-art spot-art--${spot.id}`} aria-hidden="true">
        <span className="spot-art__symbol">{stop?.symbol ?? "✳"}</span>
        <span className="spot-art__number">{String(spot.orderIndex + 1).padStart(2, "0")}</span>
        {claimed && (
          <span className="spot-art__stamp">✓ {text(language, "訪問済み", "VISITED")}</span>
        )}
      </div>
      <div className="walk-spot__body">
        <div className="spot-meta">
          <span>{text(language, "立ち寄りスポット", "Place to visit")}</span>
        </div>
        <h3>{name}</h3>
        <p className="spot-description">{resolveLocalizedText(spot.description ?? "", locale)}</p>
        <div className="spot-badges">
          <span className={`spot-state spot-state--${status.toLowerCase()}`}>
            {claimed ? "✓ " : ""}
            {statusText}
          </span>
          {availabilityDetail !== null && (
            <span
              className={`spot-availability spot-availability--${availability?.status.toLowerCase() ?? "open"}`}
              role="status"
            >
              {availabilityDetail}
            </span>
          )}
        </div>
        {locked && (
          <p className="spot-lock-note">
            {text(
              language,
              `先に必要なスポット: ${prerequisiteNames.join("・")}`,
              `Complete these places first: ${prerequisiteNames.join(", ")}`,
            )}
          </p>
        )}
        {claimed ? (
          <p className="spot-collected">
            {acquiredTime === null
              ? text(
                  language,
                  "この場所での思い出を、スタンプ帳に。",
                  "This memory is now in your stamp book.",
                )
              : text(
                  language,
                  `${acquiredTime} に訪問 · この場所での思い出を、スタンプ帳に。`,
                  `Visited at ${acquiredTime} · This memory is now in your stamp book.`,
                )}
          </p>
        ) : (
          children
        )}
      </div>
    </article>
  );
}

interface DemoPasscodeProps extends ConditionRendererProps {
  demoCode?: string;
}

export function DemoPasscode(props: DemoPasscodeProps): ReactElement {
  const { spot, locale, disabled, onSubmit, demoCode } = props;
  const language = locale === "ja" ? "ja" : "en";
  const [code, setCode] = useState("");
  const [error, setError] = useState<"invalid" | "unavailable" | "failed" | null>(null);
  const name = resolveLocalizedText(spot.name, locale);

  return (
    <form
      className="spot-checkin"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          const result = await onSubmit(code.trim());
          if (
            typeof result === "object" &&
            result !== null &&
            "ok" in result &&
            result.ok === false
          ) {
            const code =
              "error" in result &&
              typeof result.error === "object" &&
              result.error !== null &&
              "code" in result.error
                ? result.error.code
                : undefined;
            if (code === "INVALID_PROOF") setError("invalid");
            else if (code === "RALLY_UNAVAILABLE" || code === "SPOT_UNAVAILABLE")
              setError("unavailable");
            else setError("failed");
          }
        } catch {
          setError("failed");
        }
      }}
    >
      <label>
        <span>{text(language, "スポットの合言葉", "Spot passcode")}</span>
        <input
          aria-label={text(language, `${name}の合言葉`, `Passcode for ${name}`)}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={disabled}
          placeholder={text(language, "合言葉を入力", "Enter passcode")}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </label>
      <button className="primary-button" type="submit" disabled={disabled || code.trim() === ""}>
        {text(language, "スタンプを押す", "Collect stamp")} <span aria-hidden="true">↗</span>
      </button>
      {error !== null && (
        <p role="alert" className="checkin-error">
          {error === "invalid"
            ? text(
                language,
                "合言葉を確認して、もう一度お試しください。",
                "That passcode did not work. Please try again.",
              )
            : error === "unavailable"
              ? text(
                  language,
                  "現在は受付時間外です。受付時間を確認してからお試しください。",
                  "Check-in is currently closed. Check the opening hours and try again.",
                )
              : text(
                  language,
                  "スタンプを記録できませんでした。もう一度お試しください。",
                  "Could not record the stamp. Please try again.",
                )}
        </p>
      )}
      {(demoCode !== undefined || spot.hint !== undefined) && (
        <details className="demo-hint">
          <summary>
            {demoCode === undefined
              ? text(language, "ヒントを見る", "Show hint")
              : text(language, "デモ用の合言葉を見る", "Show demo passcode")}
          </summary>
          <p>
            {demoCode === undefined
              ? resolveLocalizedText(spot.hint ?? "", locale)
              : text(language, `デモ用の合言葉: ${demoCode}`, `Demo passcode: ${demoCode}`)}
          </p>
        </details>
      )}
    </form>
  );
}
