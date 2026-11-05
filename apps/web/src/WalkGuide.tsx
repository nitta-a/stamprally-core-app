import type { PublicRallyConfig } from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import type { NextActionPanelProps } from "@stamprally/ui";
import type { ReactElement } from "react";
import { DEMO_STOPS } from "./demoConfig.js";
import type { DemoLocale } from "./locale.js";
import { text } from "./locale.js";
import { revealLinkedSpot } from "./walkNavigation.js";

interface WalkGuideProps {
  config: PublicRallyConfig;
  locale: DemoLocale;
}

export function WalkGuide(props: WalkGuideProps): ReactElement {
  const { config, locale } = props;
  const hasPrerequisites = config.spots.some((spot) => (spot.prerequisites?.length ?? 0) > 0);
  return (
    <aside className="walk-guide" aria-label={text(locale, "街歩きガイド", "Walk guide")}>
      <section className="guide-card">
        <div className="guide-heading">
          <span className="eyebrow">WALK GUIDE</span>
          <span aria-hidden="true">↗</span>
        </div>
        <h2>
          {text(locale, "気になる場所へ、", "Go where you like,")}
          <br />
          {text(locale, "自分のペースで。", "at your own pace.")}
        </h2>
        <p>
          {text(
            locale,
            hasPrerequisites
              ? "スポットの条件を確認して、自分のペースで巡りましょう。"
              : "好きなスポットから始められます。",
            hasPrerequisites
              ? "Check each place's requirements and explore at your own pace."
              : "Start at any place you like.",
          )}
        </p>
        <ol className="walking-route">
          {[...config.spots]
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((spot) => {
              return (
                <li key={spot.id}>
                  <a href={`#spot-${spot.id}`} onClick={revealLinkedSpot}>
                    <span className="route-dot">{spot.orderIndex + 1}</span>
                    <span>{resolveLocalizedText(spot.name, locale)}</span>
                  </a>
                </li>
              );
            })}
        </ol>
        <p className="guide-note">
          {text(
            locale,
            "イラスト・所要時間はデモの目安です。実際の地図や経路ではありません。",
            "The illustration and walking times are examples, not a real map or route.",
          )}
        </p>
      </section>
      <section className="guide-card guide-card--howto">
        <span className="eyebrow">HOW TO ENJOY</span>
        <h2>{text(locale, "参加は、かんたん3ステップ", "Join in three easy steps")}</h2>
        <ol className="howto-list">
          <li>
            <strong>{text(locale, "スポットへ立ち寄る", "Visit a place")}</strong>
            <span>
              {text(locale, "取得できるスポットから始めましょう。", "Start at an available place.")}
            </span>
          </li>
          <li>
            <strong>{text(locale, "スタンプを集める", "Collect a stamp")}</strong>
            <span>
              {text(
                locale,
                "スポットに表示された方法で取得しましょう。",
                "Use the check-in method shown at each place.",
              )}
            </span>
          </li>
          <li>
            <strong>{text(locale, "達成特典を楽しむ", "Enjoy your reward")}</strong>
            <span>
              {text(
                locale,
                "達成条件や特典の内容を確認しましょう。",
                "Check the completion requirements and available rewards.",
              )}
            </span>
          </li>
        </ol>
      </section>
    </aside>
  );
}

interface NextStopProps extends NextActionPanelProps {
  acquired: number;
  required: number;
}

export function NextStop(props: NextStopProps): ReactElement {
  const { suggestions, locale, acquired, required } = props;
  const language = locale === "ja" ? "ja" : "en";
  const first = suggestions[0];
  if (first === undefined)
    return (
      <section className="next-stop">
        <h2>
          {text(language, "今取得できるスポットはありません", "No places are open right now")}
        </h2>
        <p>
          {text(
            language,
            "各スポットの受付時間や条件を確認してください。",
            "Check each place's opening hours and requirements.",
          )}
        </p>
      </section>
    );
  const stop = DEMO_STOPS[first.spot.id];
  const methods = first.spot.conditions.map(({ type }) => {
    if (type === "passcode") return text(language, "合言葉を入力", "Enter a passcode");
    if (type === "qr") return text(language, "QRコードを読み取る", "Scan a QR code");
    if (type === "nfc") return text(language, "NFCタグを読み取る", "Read an NFC tag");
    if (type === "gps") return text(language, "位置情報を確認", "Verify your location");
    return text(language, "スポットの取得方法を確認", "Check the place's instructions");
  });
  return (
    <section
      className="next-stop"
      aria-label={text(language, "次の立ち寄り先", "Next place to visit")}
    >
      <span className="next-stop__icon" aria-hidden="true">
        {stop?.symbol ?? "✳"}
      </span>
      <div>
        <span className="eyebrow">
          {acquired === 0
            ? text(language, "まずはここから", "Start here")
            : text(language, "次の立ち寄り先", "Next place to visit")}
        </span>
        <h2>{resolveLocalizedText(first.spot.name, locale)}</h2>
        <p>
          {text(
            language,
            `達成まで ${acquired} / ${required} 個。`,
            `Progress: ${acquired} / ${required} stamps. `,
          )}{" "}
          {methods.length === 0
            ? text(language, "スポットでチェックインしましょう。", "Check in at the place.")
            : `${methods.join(text(language, " または ", " or "))}${text(language, "してスタンプを獲得しましょう。", " to collect a stamp.")}`}
        </p>
      </div>
      <a className="text-button" href={`#spot-${first.spot.id}`}>
        {acquired === 0
          ? text(language, "最初のスポットを見る", "View first place")
          : text(language, "スポットを見る", "View place")}{" "}
        <span aria-hidden="true">↓</span>
      </a>
    </section>
  );
}
