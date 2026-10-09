import type { PublicRallyConfig, StampRallyClient, UserRallyState } from "@stamprally/core";
import { calculateProgress, evaluateSpotStatus, resolveLocalizedText } from "@stamprally/core";
import { useStampRally } from "@stamprally/react";
import { CompletionPanel, RallyViewer } from "@stamprally/ui";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { DemoRewardCard } from "./DemoRewardCard.js";
import { DemoPasscode, DemoSpotCard } from "./DemoSpotCard.js";
import { DEMO_STOPS } from "./demoConfig.js";
import type { DemoLocale } from "./locale.js";
import { text } from "./locale.js";
import { NextStop, WalkGuide } from "./WalkGuide.js";
import { revealLinkedSpot } from "./walkNavigation.js";

interface ParticipantExperienceProps {
  client: StampRallyClient;
  locale?: DemoLocale;
}

export function ParticipantExperience(props: ParticipantExperienceProps): ReactElement {
  const { client, locale = "ja" } = props;
  const { config, state, error } = useStampRally(client);
  const [rewardId, setRewardId] = useState<string | null>(null);
  const rewardDialog = useRef<HTMLDialogElement>(null);
  const reward = config.rewards.find((item) => item.id === rewardId);

  useEffect(() => {
    if (rewardId !== null) rewardDialog.current?.showModal();
  }, [rewardId]);

  const closeReward = (): void => {
    rewardDialog.current?.close();
    setRewardId(null);
  };

  return (
    <div className="participant-experience">
      <section className="walk-hero" aria-labelledby="walk-title">
        <div className="walk-hero__copy">
          <span className="event-label">
            <span aria-hidden="true">●</span>{" "}
            {text(
              locale,
              `気ままにめぐる、まちの${config.spots.length}スポット`,
              `Explore ${config.spots.length} places at your own pace`,
            )}
          </span>
          <p className="hero-kicker">KOMOREBI TOWN / WALK & COLLECT</p>
          <h1 id="walk-title">
            {text(locale, "今日は、少し", "Take the scenic")}
            <br />
            {text(locale, "遠回りしよう。", "route today.")}
          </h1>
          <p className="hero-description">
            {text(locale, "いつもの道の、その先へ。", "Go beyond your usual path.")}
            <br />
            {text(
              locale,
              "小さな発見を集めながら、まちを歩くスタンプラリー。",
              "Collect small discoveries as you explore the town.",
            )}
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#stamp-book">
              {text(locale, "スタンプ帳をひらく", "Open your stamp book")}{" "}
              <span aria-hidden="true">↗</span>
            </a>
            <span>{text(locale, "参加無料 · 登録不要", "Free to join · No sign-up")}</span>
          </div>
        </div>
        <div className="walk-hero__visual">
          <img
            src={`${import.meta.env.BASE_URL}walk-illustration.svg`}
            alt={text(
              locale,
              "案内所、川沿い、喫茶店、本屋をつなぐ架空の街のイラスト",
              "Illustration of a fictional town linking a welcome center, riverside, café, and bookshop",
            )}
          />
          <span className="illustration-note">
            {text(
              locale,
              "ひとつのまちに、いくつもの出会い。",
              "Many discoveries in one little town.",
            )}
          </span>
          <span className="illustration-seal" aria-hidden="true">
            TAKE A<br />
            <strong>WALK</strong>
            <br />✳
          </span>
        </div>
      </section>
      <div className="event-summary">
        <div>
          <span className="eyebrow">YOUR LITTLE ADVENTURE</span>
          <h2>{resolveLocalizedText(config.title, locale)}</h2>
        </div>
        <p>
          {resolveLocalizedText(
            config.description ??
              text(
                locale,
                "気になるスポットを巡ってスタンプを集めよう。",
                "Visit the places that catch your eye and collect stamps.",
              ),
            locale,
          )}
        </p>
      </div>
      {error !== null && state === null && (
        <p className="checkin-error" role="alert">
          {text(
            locale,
            "体験を読み込めませんでした。画面を再読み込みしてください。",
            "The experience could not be loaded. Please reload the page.",
          )}
        </p>
      )}
      <div className="walk-layout">
        <div id="spots" className="walk-main">
          <RallyViewer
            config={config}
            client={client}
            locale={locale}
            showSyncStatus={false}
            classNames={{
              root: "walk-viewer",
              header: "walk-viewer__header",
              card: "walk-viewer__spot",
              condition: "walk-viewer__condition",
              feedback: "walk-feedback",
              completion: "walk-completion",
            }}
            headerSlot={({ config: publicConfig, state }) => (
              <StampBook config={publicConfig} state={state} locale={locale} />
            )}
            customConditionRenderers={{ passcode: DemoPasscode }}
            renderSpotCard={(spotProps) => <DemoSpotCard {...spotProps} />}
            renderRewardCard={(rewardProps) => {
              if (rewardProps.reward.redemptionMethod !== "view_only") return undefined;
              const anchorId =
                rewardProps.reward.id === config.rewards[0]?.id
                  ? "rewards"
                  : `reward-${rewardProps.reward.id}`;
              return <DemoRewardCard {...rewardProps} anchorId={anchorId} />;
            }}
            renderNextAction={(nextProps) => <NextStop {...nextProps} />}
            renderCompletion={(completionProps) => {
              const viewOnlyRewards = completionProps.rewards.filter(
                ({ redemptionMethod }) => redemptionMethod === "view_only",
              );
              return <CompletionPanel {...completionProps} rewards={viewOnlyRewards} />;
            }}
            renderErrorFeedback={() => <></>}
            onViewReward={setRewardId}
            footerSlot={
              <p className="participant-note">
                {text(
                  locale,
                  "ゆっくり、寄り道しながら。歩きスマホには気をつけて、立ち止まって操作してください。",
                  "Take your time and enjoy the detours. Please stop walking before using your phone.",
                )}
              </p>
            }
          />
        </div>
        <WalkGuide config={config} locale={locale} />
      </div>
      <nav className="mobile-walk-nav" aria-label={text(locale, "街歩きメニュー", "Walk menu")}>
        <a href="#stamp-book">
          <span aria-hidden="true">✳</span>
          {text(locale, "スタンプ帳", "Stamps")}
        </a>
        <a href="#spots">
          <span aria-hidden="true">⌖</span>
          {text(locale, "スポット", "Places")}
        </a>
        {config.rewards[0]?.redemptionMethod === "view_only" && (
          <a href="#rewards">
            <span aria-hidden="true">♧</span>
            {text(locale, "特典", "Rewards")}
          </a>
        )}
      </nav>
      <dialog
        ref={rewardDialog}
        className="souvenir-dialog"
        aria-labelledby="souvenir-title"
        onCancel={() => setRewardId(null)}
        onClose={() => setRewardId(null)}
      >
        <button
          className="dialog-close"
          type="button"
          onClick={closeReward}
          aria-label={text(locale, "記念カードを閉じる", "Close keepsake")}
        >
          ×
        </button>
        <div className="souvenir-card">
          <span className="eyebrow">KOMOREBI TOWN WALK</span>
          <span className="souvenir-flower" aria-hidden="true">
            ✳
          </span>
          <h2 id="souvenir-title">
            {resolveLocalizedText(
              reward?.title ?? text(locale, "街歩きの記念カード", "Your Town Walk Keepsake"),
              locale,
            )}
          </h2>
          <p>
            {text(
              locale,
              "歩いた道も、見つけた景色も。",
              "The roads you walked and the views you found—",
            )}
            <br />
            {text(
              locale,
              "今日の寄り道が、いい思い出になりますように。",
              "may today’s little detour become a lovely memory.",
            )}
          </p>
          <span className="souvenir-signature">よりみち / GOOD WALKS, GOOD MEMORIES.</span>
        </div>
        <p className="souvenir-note">
          {text(
            locale,
            "デモの達成記念です。何度でも開いて楽しめます。",
            "A demo reward. You can open it again any time.",
          )}
        </p>
      </dialog>
    </div>
  );
}

interface StampBookProps {
  config: PublicRallyConfig;
  state: UserRallyState;
  locale: DemoLocale;
}

function StampBook(props: StampBookProps): ReactElement {
  const { config, state, locale } = props;
  const progress = calculateProgress(state, config);
  return (
    <div className="stamp-book" id="stamp-book">
      <div className="stamp-book__heading">
        <div>
          <span className="eyebrow">MY STAMP BOOK</span>
          <h2>{text(locale, "あなたのスタンプ帳", "Your stamp book")}</h2>
        </div>
        <p>
          <strong>{progress.acquired}</strong> / {progress.total}
          <span>{text(locale, "スポット", "places")}</span>
        </p>
      </div>
      <p className="stamp-book__description">
        {progress.isCompleted
          ? text(
              locale,
              "目標達成！まだ見ぬスポットにも、立ち寄ってみませんか。",
              "Goal reached! Why not visit the places you have not seen yet?",
            )
          : text(
              locale,
              `スタンプを${progress.completionRequired}個集めて、街歩きの目標を達成しましょう。`,
              `Collect ${progress.completionRequired} stamps to reach your walking goal.`,
            )}
      </p>
      <ol className="stamp-book__slots">
        {config.spots.map((spot) => {
          const acquired = evaluateSpotStatus(spot, state) === "CLAIMED";
          return (
            <li
              key={spot.id}
              className={
                acquired ? "stamp-book__slot stamp-book__slot--collected" : "stamp-book__slot"
              }
            >
              <a href={`#spot-${spot.id}`} onClick={revealLinkedSpot}>
                <span className="stamp-circle" aria-hidden="true">
                  {acquired ? "✳" : (DEMO_STOPS[spot.id]?.symbol ?? "✳")}
                </span>
                <span>{resolveLocalizedText(spot.name, locale)}</span>
                <small>
                  {acquired
                    ? text(locale, "獲得済み", "Collected")
                    : text(locale, "未獲得", "Not collected")}
                </small>
              </a>
            </li>
          );
        })}
      </ol>
      <span className="stamp-book__progress-label">
        {text(locale, "達成までの進み具合", "Progress to your goal")}
      </span>
    </div>
  );
}
