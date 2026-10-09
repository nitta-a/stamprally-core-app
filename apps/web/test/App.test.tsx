import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";

const WELCOME = "こもれび案内所";
const PARK = "川沿いの遊歩道";
const CAFE = "喫茶こもれび";
const BOOKSHOP = "まちの小さな本屋";

function completionPercentage(): number {
  const progress = screen.getByRole("progressbar", { name: "クリア進捗" });
  return Number(progress.getAttribute("value"));
}

async function collectStamp(name: string, code: string): Promise<void> {
  const article = screen.getByRole("article", { name });
  const input = within(article).getByRole("textbox", { name: `${name}の合言葉` });
  fireEvent.change(input, { target: { value: code } });
  fireEvent.click(within(article).getByRole("button", { name: "スタンプを押す" }));
  await waitFor(() => {
    expect(screen.queryByRole("textbox", { name: `${name}の合言葉` })).toBeNull();
  });
}

describe("demo app", () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, "", "/");
    vi.stubGlobal("scrollTo", vi.fn());
  });

  it("starts with a Japanese participant experience and an accessible stamp book", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: /今日は、少し.*遠回りしよう/ }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "こもれび街歩きラリー" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "参加者として体験" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("textbox", { name: `${WELCOME}の合言葉` }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.getByRole("textbox", { name: `${PARK}の合言葉` }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      within(screen.getByRole("article", { name: WELCOME }))
        .getByRole("button", { name: "スタンプを押す" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(completionPercentage()).toBe(0);
  });

  it("preserves progress and unrelated URL values through navigation and browser history", async () => {
    globalThis.history.replaceState(null, "", "/?campaign=autumn#spots");
    render(<App />);
    await collectStamp(WELCOME, "OPEN");
    const acquiredPercentage = completionPercentage();
    expect(acquiredPercentage).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("link", { name: "主催者の設定" }));
    expect(await screen.findByRole("heading", { level: 1, name: "ラリーの準備" })).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById("main-content"));
    expect(globalThis.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    expect(new URLSearchParams(globalThis.location.search).get("view")).toBe("admin");
    expect(new URLSearchParams(globalThis.location.search).get("campaign")).toBe("autumn");
    expect(globalThis.location.hash).toBe("#spots");
    globalThis.history.back();
    expect(
      await screen.findByRole("heading", { level: 1, name: /今日は、少し.*遠回りしよう/ }),
    ).toBeTruthy();
    await waitFor(() => expect(completionPercentage()).toBe(acquiredPercentage));
    expect(screen.queryByRole("textbox", { name: `${WELCOME}の合言葉` })).toBeNull();
    expect(new URLSearchParams(globalThis.location.search).has("view")).toBe(false);
    globalThis.history.forward();
    expect(await screen.findByRole("heading", { level: 1, name: "ラリーの準備" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "主催者の設定" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("opens organizer settings directly from its existing URL", () => {
    globalThis.history.replaceState(null, "", "/?view=admin");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "ラリーの準備" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "基本情報" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("textbox", { name: "ラリーの名前" }).getAttribute("value")).toBe(
      "こもれび街歩きラリー",
    );
  });

  it("keeps a rejected code local, then unlocks the other stops after a correct check-in", async () => {
    render(<App />);
    const article = screen.getByRole("article", { name: WELCOME });
    const input = within(article).getByRole("textbox", { name: `${WELCOME}の合言葉` });
    fireEvent.change(input, { target: { value: "WRONG" } });
    fireEvent.click(within(article).getByRole("button", { name: "スタンプを押す" }));
    expect(await within(article).findByRole("alert")).toHaveProperty(
      "textContent",
      "合言葉を確認して、もう一度お試しください。",
    );
    expect(completionPercentage()).toBe(0);
    expect(
      screen.queryByText("体験を読み込めませんでした。画面を再読み込みしてください。"),
    ).toBeNull();
    await collectStamp(WELCOME, "OPEN");
    expect(completionPercentage()).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: `${PARK}の合言葉` }).hasAttribute("disabled")).toBe(
      false,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("completes at three stamps and lets the participant reopen the view-only keepsake", async () => {
    render(<App />);
    await collectStamp(WELCOME, "OPEN");
    await collectStamp(PARK, "RIVER");
    await collectStamp(CAFE, "COFFEE");
    expect(await screen.findByRole("heading", { name: "スタンプラリー達成！" })).toBeTruthy();
    expect(completionPercentage()).toBe(100);
    expect(screen.getByRole("article", { name: BOOKSHOP })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /こもれび案内所\s*獲得済み/ }));
    expect(screen.getByRole("article", { name: WELCOME }).closest("details")?.open).toBe(true);
    const openCard = screen.getByRole("button", { name: "記念カードを見る" });
    expect(openCard.hasAttribute("disabled")).toBe(false);
    fireEvent.click(openCard);
    const dialog = await screen.findByRole("dialog", { name: "街歩きの記念カード" });
    expect(dialog.hasAttribute("open")).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "記念カードを閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(openCard.hasAttribute("disabled")).toBe(false);
    fireEvent.click(openCard);
    expect(await screen.findByRole("dialog", { name: "街歩きの記念カード" })).toBeTruthy();
  });

  it("applies organizer edits to a fresh participant preview", async () => {
    render(<App />);
    await collectStamp(WELCOME, "OPEN");
    fireEvent.click(screen.getByRole("link", { name: "主催者の設定" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ラリーの名前" }), {
      target: { value: "秋の街歩きラリー" },
    });
    fireEvent.click(screen.getByRole("link", { name: "参加者として体験" }));
    expect(await screen.findByRole("heading", { name: "秋の街歩きラリー" })).toBeTruthy();
    await waitFor(() => expect(completionPercentage()).toBe(0));
    expect(screen.getByRole("textbox", { name: `${WELCOME}の合言葉` })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: `${PARK}の合言葉` }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});
