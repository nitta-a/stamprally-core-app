import type { MouseEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminExperience } from "./AdminExperience.js";
import { createDemoClient } from "./createDemoClient.js";
import { DEFAULT_ADMIN_CONFIG } from "./demoConfig.js";
import type { DemoLocale } from "./locale.js";
import { text } from "./locale.js";
import { ParticipantExperience } from "./ParticipantExperience.js";

type DemoView = "participant" | "admin";

function currentView(): DemoView {
  if (new URLSearchParams(globalThis.location.search).get("view") === "admin") return "admin";
  return "participant";
}

function currentLocale(): DemoLocale {
  return new URLSearchParams(globalThis.location.search).get("lang") === "en" ? "en" : "ja";
}

function viewUrl(view: DemoView): string {
  const url = new URL(globalThis.location.href);
  if (view === "admin") url.searchParams.set("view", "admin");
  else url.searchParams.delete("view");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function App(): ReactElement {
  const [view, setView] = useState(currentView);
  const [locale, setLocale] = useState(currentLocale);
  const [admin, setAdmin] = useState(DEFAULT_ADMIN_CONFIG);
  const client = useMemo(() => createDemoClient(admin), [admin]);
  const mainContent = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateLocation = (): void => {
      setView(currentView());
      setLocale(currentLocale());
    };
    globalThis.addEventListener("popstate", updateLocation);
    return () => globalThis.removeEventListener("popstate", updateLocation);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = text(
      locale,
      "よりみち | こもれび街歩きラリー",
      "Yorimichi | Komorebi Town Walk",
    );
  }, [locale]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, nextView: DemoView): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (nextView === view) return;
    globalThis.history.pushState(null, "", viewUrl(nextView));
    setView(nextView);
    mainContent.current?.focus({ preventScroll: true });
    globalThis.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };

  const changeLocale = (): void => {
    const nextLocale = locale === "ja" ? "en" : "ja";
    const url = new URL(globalThis.location.href);
    if (nextLocale === "en") url.searchParams.set("lang", "en");
    else url.searchParams.delete("lang");
    globalThis.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setLocale(nextLocale);
  };

  return (
    <div className="demo-app">
      <a className="skip-link" href="#main-content">
        {text(locale, "本文へ移動", "Skip to content")}
      </a>
      <header className="site-header">
        <a
          className="brand"
          href={viewUrl("participant")}
          onClick={(event) => navigate(event, "participant")}
        >
          <span className="brand-mark" aria-hidden="true">
            ✳
          </span>
          <span>
            {text(locale, "よりみち", "Yorimichi")}
            <span className="brand-caption">
              {text(locale, "まちと出会うスタンプラリー", "A town discovery rally")}
            </span>
          </span>
        </a>
        <nav className="view-navigation" aria-label={text(locale, "デモの表示切替", "Demo views")}>
          <a
            href={viewUrl("participant")}
            aria-current={view === "participant" ? "page" : undefined}
            onClick={(event) => navigate(event, "participant")}
          >
            {text(locale, "参加者として体験", "Participant view")}
          </a>
          <a
            href={viewUrl("admin")}
            aria-current={view === "admin" ? "page" : undefined}
            onClick={(event) => navigate(event, "admin")}
          >
            {text(locale, "主催者の設定", "Organizer settings")}
          </a>
        </nav>
        <button
          className="language-toggle"
          type="button"
          onClick={changeLocale}
          aria-label={text(
            locale,
            "表示言語をEnglishに変更",
            "Switch display language to Japanese",
          )}
        >
          {locale === "ja" ? "EN" : "日本語"}
        </button>
        <span className="demo-tag">{text(locale, "体験用デモ", "Interactive demo")}</span>
      </header>
      <main ref={mainContent} id="main-content" className="main-content" tabIndex={-1}>
        {view === "admin" ? (
          <AdminExperience config={admin} onChange={setAdmin} locale={locale} />
        ) : (
          <ParticipantExperience client={client} locale={locale} />
        )}
      </main>
      <footer className="site-footer">
        <span className="footer-brand">✳ {text(locale, "よりみち", "Yorimichi")}</span>
        <p>
          {text(
            locale,
            "架空の街を舞台にした体験用デモです。実際の施設・特典ではありません。",
            "This demo is set in a fictional town. No real places or rewards are involved.",
          )}
        </p>
        <small>
          {text(
            locale,
            "進行状況は画面を開いている間だけ保持されます。再読み込みや設定の変更でリセットされます。",
            "Progress lasts only while this page remains open. Reloading or changing settings resets it.",
          )}
        </small>
      </footer>
    </div>
  );
}
