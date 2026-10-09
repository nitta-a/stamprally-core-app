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
            "最初は案内所へ。そのあとは、好きな順番で立ち寄れます。",
            "Start at the welcome center, then visit the other places in any order.",
          )}
        </p>
        <ol className="walking-route">
          {config.spots.map((spot) => {
            const stop = DEMO_STOPS[spot.id];
            return (
              <li key={spot.id}>
                <a href={`#spot-${spot.id}`} onClick={revealLinkedSpot}>
                  <span className="route-dot">{spot.orderIndex + 1}</span>
                  <span>
                    {resolveLocalizedText(spot.name, locale)}
                    <small>
                      {stop === undefined ? "" : resolveLocalizedText(stop.walk, locale)}
                    </small>
                  </span>
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
              {text(locale, "まずは案内所からスタート。", "Start at the welcome center.")}
            </span>
          </li>
          <li>
            <strong>
              {text(locale, "合言葉でスタンプを押す", "Enter the passcode to collect a stamp")}
            </strong>
            <span>
              {text(
                locale,
                "「デモ用の合言葉を見る」で試せます。",
                "Try it with the “Show demo passcode” button.",
              )}
            </span>
          </li>
          <li>
            <strong>{text(locale, "達成特典を楽しむ", "Enjoy your reward")}</strong>
            <span>
              {text(
                locale,
                "スタンプを集めて記念カードを開こう。",
                "Collect stamps and open your keepsake.",
              )}
            </span>
          </li>
        </ol>
      </section>
    </aside>
  );
}

interface NextStopProps extends NextActionPanelProps {}

export function NextStop(props: NextStopProps): ReactElement {
  const { suggestions, locale } = props;
  const language = locale === "ja" ? "ja" : "en";
  const first = suggestions[0];
  if (first === undefined)
    return (
      <section className="next-stop">
        <h2>{text(language, "立ち寄れるスポットがありません", "No places to visit right now")}</h2>
        <p>
          {text(
            language,
            "主催者画面でスポットの設定を確認してください。",
            "Check the place settings in organizer view.",
          )}
        </p>
      </section>
    );
  const stop = DEMO_STOPS[first.spot.id];
  return (
    <section
      className="next-stop"
      aria-label={text(language, "次の立ち寄り先", "Next place to visit")}
    >
      <span className="next-stop__icon" aria-hidden="true">
        {stop?.symbol ?? "✳"}
      </span>
      <div>
        <span className="eyebrow">{text(language, "次の立ち寄り先", "Next place to visit")}</span>
        <h2>{resolveLocalizedText(first.spot.name, locale)}</h2>
        <p>
          {stop === undefined
            ? text(language, "好きな順番で巡れます", "Visit in any order")
            : resolveLocalizedText(stop.walk, locale)}
        </p>
      </div>
      <a className="text-button" href={`#spot-${first.spot.id}`}>
        {text(language, "スポットを見る", "View place")} <span aria-hidden="true">↓</span>
      </a>
    </section>
  );
}
