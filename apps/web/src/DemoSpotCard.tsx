import { resolveLocalizedText } from "@stamprally/core";
import type { ConditionRendererProps, SpotCardProps } from "@stamprally/ui";
import type { ReactElement } from "react";
import { useState } from "react";
import { DEMO_STOPS } from "./demoConfig.js";
import { text } from "./locale.js";

interface DemoSpotCardProps extends SpotCardProps {}

export function DemoSpotCard(props: DemoSpotCardProps): ReactElement {
  const { spot, status, locale, children } = props;
  const stop = DEMO_STOPS[spot.id];
  const language = locale === "ja" ? "ja" : "en";
  const name = resolveLocalizedText(spot.name, locale);
  const claimed = status === "CLAIMED";
  const locked = status === "LOCKED";
  let statusText = text(language, "スタンプ未獲得", "Not collected");
  if (claimed) statusText = text(language, "獲得済み", "Collected");
  else if (locked) statusText = text(language, "案内所からスタート", "Start at the welcome center");
  else if (status === "VERIFYING") statusText = text(language, "確認中…", "Checking…");

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
          <span>
            {stop === undefined
              ? text(language, "立ち寄りスポット", "Place to visit")
              : resolveLocalizedText(stop.category, locale)}
          </span>
          <span>{stop === undefined ? "" : resolveLocalizedText(stop.walk, locale)}</span>
        </div>
        <h3>{name}</h3>
        <p className="spot-description">{resolveLocalizedText(spot.description ?? "", locale)}</p>
        <span className={`spot-state spot-state--${status.toLowerCase()}`}>
          {claimed ? "✓ " : ""}
          {statusText}
        </span>
        {locked && (
          <p className="spot-lock-note">
            {text(
              language,
              "まず案内所で最初のスタンプを押してください。",
              "Collect your first stamp at the welcome center to unlock this place.",
            )}
          </p>
        )}
        {claimed ? (
          <p className="spot-collected">
            {text(
              language,
              "この場所での思い出を、スタンプ帳に。",
              "This memory is now in your stamp book.",
            )}
          </p>
        ) : (
          children
        )}
      </div>
    </article>
  );
}

interface DemoPasscodeProps extends ConditionRendererProps {}

export function DemoPasscode(props: DemoPasscodeProps): ReactElement {
  const { spot, locale, disabled, onSubmit } = props;
  const language = locale === "ja" ? "ja" : "en";
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const name = resolveLocalizedText(spot.name, locale);

  return (
    <form
      className="spot-checkin"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(false);
        try {
          const result = await onSubmit(code.trim());
          if (
            typeof result === "object" &&
            result !== null &&
            "ok" in result &&
            result.ok === false
          )
            setError(true);
        } catch {
          setError(true);
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
      {error && (
        <p role="alert" className="checkin-error">
          {text(
            language,
            "合言葉を確認して、もう一度お試しください。",
            "That passcode did not work. Please try again.",
          )}
        </p>
      )}
      <details className="demo-hint">
        <summary>{text(language, "デモ用の合言葉を見る", "Show demo passcode")}</summary>
        <p>
          {resolveLocalizedText(
            spot.hint ??
              text(
                language,
                "主催者画面で合言葉を設定してください。",
                "Set a passcode in organizer settings.",
              ),
            locale,
          )}
        </p>
      </details>
    </form>
  );
}
