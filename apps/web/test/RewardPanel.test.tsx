import type { ConsumeResult, RewardItem, RewardState } from "@stamprally/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RewardPanel } from "../src/components/RewardPanel.js";

const rewards: ReadonlyArray<RewardItem> = [
  {
    id: "manual",
    title: { ja: "手動特典", en: "Manual Reward" },
    description: { ja: "スライドで利用", en: "Slide to redeem" },
    type: "in_person",
    redemptionMethod: "manual_slide",
    requiredStampCount: 1,
  },
  {
    id: "staff",
    title: { ja: "スタッフ特典", en: "Staff Reward" },
    description: { ja: "合言葉で利用", en: "Redeem with a passcode" },
    type: "in_person",
    redemptionMethod: "staff_passcode",
    requiredStampCount: 2,
    staffPasscode: "STAFF",
  },
  {
    id: "view",
    title: { ja: "閲覧特典", en: "View Reward" },
    description: { ja: "閲覧のみ", en: "View only" },
    type: "digital",
    redemptionMethod: "view_only",
    requiredStampCount: 3,
  },
];

const states: ReadonlyArray<RewardState> = rewards.map((reward) => ({
  rewardId: reward.id,
  status: "AVAILABLE",
}));
const manualReward: RewardItem = {
  id: "manual",
  title: { ja: "手動特典", en: "Manual Reward" },
  description: { ja: "スライドで利用", en: "Slide to redeem" },
  type: "in_person",
  redemptionMethod: "manual_slide",
  requiredStampCount: 1,
};

function success(rewardId: string): ConsumeResult {
  return { ok: true, value: { rewardId, status: "CONSUMED" } };
}

describe("RewardPanel", () => {
  it("supports manual slide, staff passcode, and view-only actions", async () => {
    const onRedeem = vi.fn(async (rewardId: string) => success(rewardId));
    const onNotify = vi.fn();
    render(
      <RewardPanel
        rewards={rewards}
        states={states}
        locale="ja"
        isPending={false}
        onRedeem={onRedeem}
        onNotify={onNotify}
      />,
    );

    fireEvent.change(screen.getByRole("slider", { name: "右端までスライドしてもぎる" }), {
      target: { value: "100" },
    });
    await waitFor(() => expect(onRedeem).toHaveBeenCalledWith("manual", undefined));

    fireEvent.change(screen.getByLabelText("スタッフ合言葉"), {
      target: { value: "STAFF" },
    });
    fireEvent.click(screen.getByRole("button", { name: "もぎり" }));
    await waitFor(() =>
      expect(onRedeem).toHaveBeenCalledWith("staff", {
        passcode: "STAFF",
        staffId: "demo-staff",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "特典を見る" }));
    await waitFor(() => expect(onRedeem).toHaveBeenCalledWith("view", undefined));
    expect(onNotify).toHaveBeenCalledWith(true, "特典を利用しました。");
  });

  it("rerenders localized reward text and status", () => {
    const onRedeem = vi.fn(async (rewardId: string) => success(rewardId));
    const { rerender } = render(
      <RewardPanel
        rewards={[manualReward]}
        states={[{ rewardId: "manual", status: "LOCKED" }]}
        locale="ja"
        isPending={false}
        onRedeem={onRedeem}
        onNotify={() => undefined}
      />,
    );
    expect(screen.getByText("手動特典")).toBeTruthy();
    expect(screen.getByText("順序待ち")).toBeTruthy();

    rerender(
      <RewardPanel
        rewards={[manualReward]}
        states={[{ rewardId: "manual", status: "LOCKED" }]}
        locale="en"
        isPending={false}
        onRedeem={onRedeem}
        onNotify={() => undefined}
      />,
    );
    expect(screen.getByText("Manual Reward")).toBeTruthy();
    expect(screen.getByText("Locked")).toBeTruthy();
  });
});
