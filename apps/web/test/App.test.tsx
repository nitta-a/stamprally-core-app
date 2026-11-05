import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { createDemoClient } from "../src/createDemoClient.js";
import { DEFAULT_ADMIN_CONFIG } from "../src/demoConfig.js";
import { ParticipantExperience } from "../src/ParticipantExperience.js";

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

  it("does not present the old demo passcode after the organizer changes it", async () => {
    render(<App />);
    const initialCard = screen.getByRole("article", { name: WELCOME });
    fireEvent.click(within(initialCard).getByText("デモ用の合言葉を見る"));
    expect(within(initialCard).getByText("デモ用の合言葉: OPEN")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "主催者の設定" }));
    fireEvent.click(screen.getByRole("tab", { name: "スポット" }));
    const summary = screen.getByText(WELCOME, { selector: "strong" });
    const details = summary.closest("details");
    if (details === null) throw new Error("Expected spot details.");
    fireEvent.click(summary);
    fireEvent.change(within(details).getByDisplayValue("OPEN"), { target: { value: "NEW-CODE" } });
    fireEvent.click(screen.getByRole("link", { name: "参加者として体験" }));
    const updatedCard = await screen.findByRole("article", { name: WELCOME });
    expect(within(updatedCard).queryByText("デモ用の合言葉を見る")).toBeNull();
    expect(within(updatedCard).queryByText(/デモ用の合言葉: OPEN/)).toBeNull();
    expect(updatedCard.textContent).not.toContain("NEW-CODE");
    await collectStamp(WELCOME, "NEW-CODE");
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
    const rewardCard = screen
      .getByRole("heading", { name: "街歩きの記念カード" })
      .closest("article");
    if (rewardCard === null) throw new Error("Expected reward card.");
    expect(within(rewardCard).getByText("スタンプ 3 / 3 個")).toBeTruthy();
    const openCard = within(rewardCard).getByRole("button", { name: "特典を見る" });
    expect(openCard.hasAttribute("disabled")).toBe(false);
    fireEvent.click(openCard);
    const dialog = await screen.findByRole("dialog", { name: "街歩きの記念カード" });
    expect(dialog.hasAttribute("open")).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "特典を閉じる" }));
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

  it("supports secondary check-in conditions and non-view_only reward claims in participant preview", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const client = createDemoClient({
      ...DEFAULT_ADMIN_CONFIG,
      staffPasscode: "STAFF-777",
      spots: [
        {
          id: "welcome",
          orderIndex: 0,
          name: { ja: WELCOME, en: "Welcome" },
          conditions: [
            { type: "qr", secretToken: "QR-ONLY" },
            { type: "passcode", code: "FALLBACK-OPEN" },
          ],
        },
      ],
      completion: { condition: { type: "stamp_count", count: 1 } },
      rewards: [
        {
          id: "onsite-gift",
          title: { ja: "案内所のオリジナル栞", en: "Bookmark" },
          type: "in_person",
          redemptionMethod: "staff_passcode",
          requiredStampCount: 1,
        },
      ],
    });
    render(<ParticipantExperience client={client} locale="ja" />);

    await collectStamp(WELCOME, "FALLBACK-OPEN");

    const rewardHeading = await screen.findByRole("heading", { name: "案内所のオリジナル栞" });
    const rewardCard = rewardHeading.closest("article");
    if (rewardCard === null) throw new Error("Expected reward article.");
    const staffInput = within(rewardCard).getByRole("textbox", {
      name: "案内所のオリジナル栞のスタッフ確認用コード",
    });
    fireEvent.change(staffInput, { target: { value: "WRONG-STAFF" } });
    fireEvent.click(within(rewardCard).getByRole("button", { name: "特典を受け取る" }));
    expect(await within(rewardCard).findByRole("alert")).toHaveProperty(
      "textContent",
      "スタッフ確認用コードを確認して、もう一度お試しください。",
    );

    fireEvent.change(staffInput, { target: { value: "STAFF-777" } });
    fireEvent.click(within(rewardCard).getByRole("button", { name: "特典を受け取る" }));
    await waitFor(() => {
      expect(within(rewardCard).getByRole("button", { name: "受け取り済み" })).toBeTruthy();
    });
    expect(within(rewardCard).getByRole("status").textContent).toContain("引換番号: CLAIM-");
  });

  it("shows acquired timestamps, missing reward spots, spot availability details, and resets progress", async () => {
    const client = createDemoClient({
      ...DEFAULT_ADMIN_CONFIG,
      spots: [
        {
          id: "welcome",
          orderIndex: 0,
          name: { ja: WELCOME, en: "Welcome" },
          conditions: [{ type: "passcode", code: "OPEN" }],
        },
        {
          id: "park",
          orderIndex: 1,
          name: { ja: PARK, en: "Park" },
          conditions: [{ type: "passcode", code: "RIVER" }],
          availability: {
            timezone: "UTC",
            weekly: [],
          },
        },
      ],
      rewards: [
        {
          id: "specific-gift",
          title: { ja: "遊歩道達成バッジ", en: "Park Badge" },
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 1,
          conditions: [{ type: "stamps", stampIds: ["park"] }],
        },
      ],
    });
    render(<ParticipantExperience client={client} locale="ja" />);

    expect(screen.getByText(`必要なスポット: ${PARK}`)).toBeTruthy();
    expect(screen.getByText("受付時間外")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "進捗をリセット" })).toBeNull();

    await collectStamp(WELCOME, "OPEN");

    expect(
      screen.getByRole("link", { name: /こもれび案内所\s*獲得済み \(\d{2}:\d{2}\)/ }),
    ).toBeTruthy();
    const resetButton = screen.getByRole("button", { name: "進捗をリセット" });
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    fireEvent.click(resetButton);
    expect(completionPercentage()).toBeGreaterThan(0);
    fireEvent.click(resetButton);
    expect(confirm).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(completionPercentage()).toBe(0));
    expect(screen.getByRole("textbox", { name: `${WELCOME}の合言葉` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "進捗をリセット" })).toBeNull();
  });
});
