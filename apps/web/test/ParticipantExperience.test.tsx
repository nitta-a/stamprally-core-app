import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDemoClient } from "../src/createDemoClient.js";
import { DemoRewardCard } from "../src/DemoRewardCard.js";
import { DemoPasscode, DemoSpotCard } from "../src/DemoSpotCard.js";
import { DEFAULT_ADMIN_CONFIG } from "../src/demoConfig.js";
import { ParticipantExperience } from "../src/ParticipantExperience.js";
import { WalkGuide } from "../src/WalkGuide.js";

describe("participant completion", () => {
  it("updates the walk guidance when prerequisites are removed", () => {
    const client = createDemoClient(DEFAULT_ADMIN_CONFIG);
    const config = client.getConfig();
    const { rerender } = render(<WalkGuide config={config} locale="ja" />);
    expect(screen.getByText("スポットの条件を確認して、自分のペースで巡りましょう。")).toBeTruthy();
    const spots = config.spots.map(({ prerequisites: _prerequisites, ...spot }) => spot);
    rerender(<WalkGuide config={{ ...config, spots }} locale="ja" />);
    expect(screen.getByText("好きなスポットから始められます。")).toBeTruthy();
  });
  it("guides a new participant to the configured first available spot", async () => {
    const client = createDemoClient({
      ...DEFAULT_ADMIN_CONFIG,
      spots: [
        {
          id: "library",
          name: "図書館",
          orderIndex: 0,
          conditions: [{ type: "passcode", code: "OPEN" }],
        },
        {
          id: "park",
          name: "公園",
          orderIndex: 1,
          prerequisites: ["library"],
          conditions: [{ type: "passcode", code: "NEXT" }],
        },
      ],
      completion: { condition: { type: "stamp_count", count: 2 } },
      rewards: [],
    });
    render(<ParticipantExperience client={client} />);
    const guide = await screen.findByRole("region", { name: "次の立ち寄り先" });
    expect(within(guide).getByRole("heading", { name: "図書館" })).toBeTruthy();
    expect(within(guide).getByText(/達成まで 0 \/ 2 個/)).toBeTruthy();
    expect(within(guide).getByText(/合言葉を入力/)).toBeTruthy();
    expect(
      within(guide)
        .getByRole("link", { name: /最初のスポットを見る/ })
        .getAttribute("href"),
    ).toBe("#spot-library");
  });
  it("does not redeem a reward when confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClaim = vi.fn();
    const { rerender } = render(
      <DemoRewardCard
        anchorId="reward"
        locale="ja"
        reward={{
          id: "r",
          title: "景品",
          type: "in_person",
          redemptionMethod: "manual_slide",
          requiredStampCount: 1,
        }}
        state={{ rewardId: "r", status: "AVAILABLE" }}
        progress={{
          rewardId: "r",
          isUnlocked: true,
          acquired: 1,
          required: 1,
          percentage: 100,
          missingStampIds: [],
        }}
        missingSpotIds={[]}
        missingSpotNames={[]}
        onClaim={onClaim}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "確認して特典を受け取る" }));
    expect(onClaim).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("景品"));
    rerender(
      <DemoRewardCard
        anchorId="reward"
        locale="ja"
        reward={{
          id: "r",
          title: "景品",
          type: "in_person",
          redemptionMethod: "manual_slide",
          requiredStampCount: 1,
        }}
        state={{ rewardId: "r", status: "AVAILABLE" }}
        progress={{
          rewardId: "r",
          isUnlocked: true,
          acquired: 1,
          required: 1,
          percentage: 100,
          missingStampIds: [],
        }}
        inventory={{ sharedRemaining: 0 }}
        missingSpotIds={[]}
        missingSpotNames={[]}
        onClaim={onClaim}
      />,
    );
    expect(screen.getByRole("button", { name: "在庫切れ" })).toHaveProperty("disabled", true);
  });
  it("names the configured prerequisite instead of a demo-specific location", () => {
    render(
      <DemoSpotCard
        spot={{ id: "next", name: "Next", orderIndex: 1, conditions: [], prerequisites: ["other"] }}
        state={{ rallyId: "r", userId: null, records: [], rewards: [], updatedAt: "" }}
        status="LOCKED"
        locale="ja"
        prerequisiteNames={["博物館"]}
      >
        {null}
      </DemoSpotCard>,
    );
    expect(screen.getByText("先に必要なスポット: 博物館")).toBeTruthy();
  });
  it("keeps staff rewards separate from viewing the souvenir", async () => {
    const client = createDemoClient({
      ...DEFAULT_ADMIN_CONFIG,
      completion: { condition: { type: "stamp_count", count: 1 } },
      rewards: [
        {
          id: "card",
          title: "記念カード",
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 1,
        },
        {
          id: "staff-gift",
          title: "受付で受け取る特典",
          type: "in_person",
          redemptionMethod: "staff_passcode",
          requiredStampCount: 1,
          staffPasscode: "STAFF",
        },
      ],
    });
    await client.checkIn("welcome", "OPEN");
    render(<ParticipantExperience client={client} />);
    const completion = await screen.findByRole("region", { name: "スタンプラリー達成！" });
    expect(within(completion).getAllByRole("button", { name: "特典を見る" })).toHaveLength(1);
    expect(document.getElementById("spots")?.contains(completion)).toBe(true);
    expect(within(completion).queryByText("受付で受け取る特典")).toBeNull();
    expect(screen.getByRole("heading", { name: "受付で受け取る特典" })).toBeTruthy();
  });
});

describe("passcode feedback", () => {
  it("distinguishes an incorrect passcode from a recording failure", async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "INVALID_PROOF" } })
      .mockResolvedValueOnce({ ok: false, error: { code: "SYNC_FAILED" } })
      .mockResolvedValueOnce({ ok: false, error: { code: "SPOT_UNAVAILABLE" } });
    render(
      <DemoPasscode
        spot={{ id: "s", orderIndex: 0, name: "場所", conditions: [] }}
        condition={{ type: "passcode" }}
        locale="ja"
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "OPEN" } });
    fireEvent.click(screen.getByRole("button", { name: "スタンプを押す" }));
    expect((await screen.findByRole("alert")).textContent).toContain("合言葉を確認");
    fireEvent.click(screen.getByRole("button", { name: "スタンプを押す" }));
    expect(await screen.findByText(/スタンプを記録できませんでした/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "スタンプを押す" }));
    expect(await screen.findByText(/現在は受付時間外/)).toBeTruthy();
  });
});
