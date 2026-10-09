import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoClient } from "../src/createDemoClient.js";
import { DEFAULT_ADMIN_CONFIG } from "../src/demoConfig.js";
import { ParticipantExperience } from "../src/ParticipantExperience.js";

describe("participant completion", () => {
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
    expect(within(completion).queryByText("受付で受け取る特典")).toBeNull();
    expect(screen.getByRole("heading", { name: "受付で受け取る特典" })).toBeTruthy();
  });
});
