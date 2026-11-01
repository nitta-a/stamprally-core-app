// @vitest-environment jsdom
import { useStampRally } from "@stamprally/react";
import { RallyViewer } from "@stamprally/ui";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createAdminConfig, createTestBackend, RALLY_ID, SECRETS } from "./support/backend.js";
import { createTestDevice } from "./support/device.js";
import { rewardStatus, stampIds } from "./support/state.js";

afterEach(cleanup);

function closestArticle(element: HTMLElement, name: string): HTMLElement {
  const article = element.closest("article");
  if (article === null) throw new Error(`No card was rendered for ${name}.`);
  return article;
}

function spotCard(name: string): HTMLElement {
  const spots = screen.getByRole("region", { name: "Spots" });
  return closestArticle(within(spots).getByRole("heading", { name, level: 2 }), name);
}

function rewardCard(title: string): HTMLElement {
  const rewards = screen.getByRole("region", { name: "Rewards" });
  return closestArticle(within(rewards).getByRole("heading", { name: title, level: 3 }), title);
}

function submitProof(spotName: string, fieldName: string, value: string): void {
  const card = spotCard(spotName);
  fireEvent.change(within(card).getByRole("textbox", { name: fieldName }), {
    target: { value },
  });
  fireEvent.click(within(card).getByRole("button", { name: "Check in" }));
}

describe("RallyViewer with a real client and server", () => {
  it("checks in, rejects a wrong passcode, unlocks prerequisites, and redeems a reward", async () => {
    const { publicConfig, persistence, network } = createTestBackend({
      config: createAdminConfig({ goodieStock: 10 }),
    });
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    render(<RallyViewer client={client} locale="en" nextAction={{ enabled: false }} />);
    expect(await within(spotCard("Museum")).findByText("Complete Gate to unlock this spot.")).toBe(
      within(spotCard("Museum")).getByRole("status"),
    );

    submitProof("Gate", "Passcode", "TYPO");
    expect((await within(spotCard("Gate")).findByRole("alert")).textContent).toBe(
      "Verification failed.",
    );
    expect(await persistence.getUserState(RALLY_ID, anonymousSessionId)).toBeNull();

    submitProof("Gate", "Passcode", SECRETS.gatePasscode);
    expect(await screen.findByText("Gate collected. 1/3 to complete.")).toBeTruthy();
    expect(within(spotCard("Gate")).getByText("CLAIMED")).toBeTruthy();
    expect(within(spotCard("Museum")).queryByText("Complete Gate to unlock this spot.")).toBeNull();

    submitProof("Museum", "QR value", SECRETS.museumToken);
    expect(await screen.findByText("Museum collected. 2/3 to complete.")).toBeTruthy();

    fireEvent.click(
      within(rewardCard("Goodie bag")).getByRole("button", { name: "Redeem reward" }),
    );
    expect(
      await within(rewardCard("Goodie bag")).findByRole("button", { name: "CONSUMED" }),
    ).toBeTruthy();
    expect(within(rewardCard("Goodie bag")).getByText("9 remaining")).toBeTruthy();

    const serverState = await persistence.getUserState(RALLY_ID, anonymousSessionId);
    expect(stampIds(serverState)).toEqual(["gate", "museum"]);
    expect(rewardStatus(serverState, "goodie")).toBe("CONSUMED");
    expect(persistence.getClaimRecords()).toHaveLength(1);
  });

  it("shows offline progress, then surfaces server rollbacks after reconnecting", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    render(<RallyViewer client={client} locale="en" nextAction={{ enabled: false }} />);
    await screen.findByRole("region", { name: "Spots" });
    network.setOffline(true);

    submitProof("Gate", "Passcode", SECRETS.gatePasscode);
    expect(await screen.findByText("Recording offline (unsynced: 1件)")).toBeTruthy();
    submitProof("Tower", "Passcode", "TYPO");
    expect(await screen.findByText("Recording offline (unsynced: 2件)")).toBeTruthy();
    expect(within(spotCard("Tower")).getByText("CLAIMED")).toBeTruthy();

    network.setOffline(false);
    await act(() => client.sync());

    const rollback = await screen.findByRole("alert");
    expect(rollback.textContent).toContain("Some check-ins were rolled back by the server");
    expect(screen.queryByText(/Recording offline/)).toBeNull();
    expect(within(spotCard("Gate")).getByText("CLAIMED")).toBeTruthy();
    expect(within(spotCard("Tower")).getByText("UNCLAIMED")).toBeTruthy();
    expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
      "gate",
    ]);
  });
});

describe("useStampRally with a real client and server", () => {
  it("exposes server results, offline queue state, and sync through the hook", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    const { result } = renderHook(() => useStampRally(client));
    await waitFor(() => expect(result.current.state).not.toBeNull());

    await act(() => result.current.onCheckIn("gate", "TYPO"));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.state?.records).toEqual([]);

    await act(() => result.current.onCheckIn("gate", SECRETS.gatePasscode));
    expect(result.current.error).toBeNull();
    expect(stampIds(result.current.state)).toEqual(["gate"]);

    network.setOffline(true);
    await act(() => result.current.onCheckIn("tower", SECRETS.towerPasscode));
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.syncState.pendingCount).toBe(1);
    expect(rewardStatus(result.current.state, "goodie")).toBe("AVAILABLE");

    network.setOffline(false);
    await act(() => result.current.onSync());
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.syncStatus).toBe("idle");
    expect(result.current.rejectedHistory).toEqual([]);
    expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
      "gate",
      "tower",
    ]);

    const claim = await act(() => result.current.onClaimReward("goodie"));
    expect(claim.ok).toBe(true);
    expect(rewardStatus(result.current.state, "goodie")).toBe("CONSUMED");
  });
});
