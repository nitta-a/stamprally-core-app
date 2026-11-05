// @vitest-environment jsdom

import type { StampRallyClient } from "@stamprally/core";
import { MuiRallyViewer } from "@stamprally/mui";
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
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminConfig, createTestBackend, RALLY_ID, SECRETS } from "./support/backend.js";
import { createTestDevice } from "./support/device.js";
import { rewardStatus, stampIds } from "./support/state.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

function MuiClientView({ client }: { client: StampRallyClient }) {
  const adapter = useStampRally(client);
  return <MuiRallyViewer adapter={adapter} locale="en" />;
}

describe("RallyViewer with a real client and server", () => {
  it("passes prerequisite names to a custom spot card with a real client", async () => {
    const { publicConfig, network } = createTestBackend();
    const { client } = createTestDevice({ publicConfig, network });
    render(
      <RallyViewer
        client={client}
        locale="en"
        renderSpotCard={({ spot, prerequisiteNames }) => (
          <article>
            <h2>{String(spot.name)}</h2>
            <p>{prerequisiteNames?.join(", ")}</p>
          </article>
        )}
      />,
    );
    const card = spotCard("Museum");
    expect(within(card).getByText("Gate")).toBeTruthy();
  });
  it.each(["standard", "MUI"] as const)(
    "redeems a staff-passcode reward from the %s completion panel",
    async (variant) => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const base = createAdminConfig();
      const staff = base.rewards.find((reward) => reward.id === "staff-gift");
      if (staff === undefined) throw new Error("Expected staff reward.");
      const config = {
        ...base,
        completion: { condition: { type: "stamp_count" as const, count: 1 } },
        rewards: [{ ...staff, requiredStampCount: 1 }],
      };
      const { publicConfig, persistence, network } = createTestBackend({ config });
      const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
      expect((await client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);
      if (variant === "standard")
        render(<RallyViewer client={client} locale="en" nextAction={{ enabled: false }} />);
      else render(<MuiClientView client={client} />);

      const panel = await screen.findByRole("region", { name: "Stamp rally complete!" });
      if (variant === "standard") {
        fireEvent.change(within(panel).getByLabelText("Staff passcode"), {
          target: { value: SECRETS.staffPasscode },
        });
        fireEvent.click(within(panel).getByRole("button", { name: "Redeem reward" }));
      } else {
        fireEvent.click(within(panel).getByRole("button", { name: "Redeem" }));
        const dialog = screen.getByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Staff passcode"), {
          target: { value: SECRETS.staffPasscode },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
      }
      await waitFor(async () =>
        expect(
          rewardStatus(await persistence.getUserState(RALLY_ID, anonymousSessionId), "staff-gift"),
        ).toBe("CONSUMED"),
      );
      expect(persistence.getClaimRecords()).toHaveLength(1);
    },
  );

  it("updates reward availability when synced server stock is exhausted", async () => {
    const base = createAdminConfig({ goodieStock: 1 });
    const goodie = base.rewards.find((reward) => reward.id === "goodie");
    if (goodie === undefined) throw new Error("Expected goodie reward.");
    const config = { ...base, rewards: [{ ...goodie, requiredStampCount: 1 }] };
    const { publicConfig, persistence, network } = createTestBackend({ config });
    const first = createTestDevice({ publicConfig, network });
    const second = createTestDevice({ publicConfig, network });
    expect((await first.client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);
    expect((await second.client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);
    await second.client.sync();
    render(<RallyViewer client={second.client} locale="en" nextAction={{ enabled: false }} />);
    const card = rewardCard("Goodie bag");
    expect(within(card).getByRole("button", { name: "Redeem reward" })).toHaveProperty(
      "disabled",
      false,
    );
    expect((await first.client.claimReward("goodie")).ok).toBe(true);
    await act(async () => second.client.sync());
    expect(second.client.getState()?.inventory?.rewardRemaining?.goodie).toBe(0);
    expect(within(card).getByRole("button", { name: "Redeem reward" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(await persistence.getRewardStock(RALLY_ID, "goodie")).toBe(0);
    expect(persistence.getClaimRecords()).toHaveLength(1);
  });

  it("passes a staff passcode through the MUI viewer to the server", async () => {
    const base = createAdminConfig();
    const staff = base.rewards.find((reward) => reward.id === "staff-gift");
    if (staff === undefined) throw new Error("Expected staff reward.");
    const { publicConfig, persistence, network } = createTestBackend({
      config: { ...base, rewards: [{ ...staff, requiredStampCount: 1 }] },
    });
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    render(<MuiClientView client={client} />);
    const gate = (await screen.findByRole("heading", { name: "Gate" })).closest(".MuiCard-root");
    if (!(gate instanceof HTMLElement)) throw new Error("Expected gate card.");
    fireEvent.change(within(gate).getByRole("textbox", { name: "Passcode" }), {
      target: { value: SECRETS.gatePasscode },
    });
    fireEvent.click(within(gate).getByRole("button", { name: "Check in" }));
    await waitFor(async () =>
      expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toContain(
        "gate",
      ),
    );
    const card = screen.getByRole("heading", { name: "Staff gift" }).closest(".MuiCard-root");
    if (!(card instanceof HTMLElement)) throw new Error("Expected reward card.");
    fireEvent.click(within(card).getByRole("button", { name: "Redeem" }));
    fireEvent.change(screen.getByLabelText("Staff passcode"), {
      target: { value: SECRETS.staffPasscode },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(async () =>
      expect(
        rewardStatus(await persistence.getUserState(RALLY_ID, anonymousSessionId), "staff-gift"),
      ).toBe("CONSUMED"),
    );
  });

  it("redeems a staff-passcode reward through the standard reward card", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const base = createAdminConfig();
    const staff = base.rewards.find((reward) => reward.id === "staff-gift");
    if (staff === undefined) throw new Error("Expected staff reward.");
    const { publicConfig, persistence, network } = createTestBackend({
      config: { ...base, rewards: [{ ...staff, requiredStampCount: 1 }] },
    });
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    render(<RallyViewer client={client} locale="en" nextAction={{ enabled: false }} />);
    submitProof("Gate", "Passcode", SECRETS.gatePasscode);
    await screen.findByText("Gate collected. 1/3 to complete.");
    const card = rewardCard("Staff gift");
    const input = within(card).getByLabelText("Staff passcode");
    const redeem = within(card).getByRole("button", { name: "Redeem reward" });
    fireEvent.change(input, { target: { value: "WRONG" } });
    fireEvent.click(redeem);
    expect(await within(card).findByRole("alert")).toBeTruthy();
    expect(persistence.getClaimRecords()).toHaveLength(0);
    fireEvent.change(input, { target: { value: SECRETS.staffPasscode } });
    fireEvent.click(redeem);
    await waitFor(async () =>
      expect(
        rewardStatus(await persistence.getUserState(RALLY_ID, anonymousSessionId), "staff-gift"),
      ).toBe("CONSUMED"),
    );
  });

  it("exposes a client check-in error through the React hook", async () => {
    const { publicConfig, network } = createTestBackend();
    const { client } = createTestDevice({ publicConfig, network });
    const { result } = renderHook(() => useStampRally(client));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.onCheckIn("missing", "proof");
    });
    expect(result.current.error?.message).toBe("Spot was not found.");
  });

  it("sends a MUI passcode through the real client and server", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    render(<MuiClientView client={client} />);
    const card = (await screen.findByRole("heading", { name: "Gate" })).closest(".MuiCard-root");
    if (!(card instanceof HTMLElement)) throw new Error("Expected MUI spot card.");
    const input = within(card).getByRole("textbox", { name: "Passcode" });
    fireEvent.change(input, { target: { value: "WRONG" } });
    fireEvent.click(within(card).getByRole("button", { name: "Check in" }));
    expect(await within(card).findByRole("alert")).toBeTruthy();
    expect(await persistence.getUserState(RALLY_ID, anonymousSessionId)).toBeNull();
    fireEvent.change(input, { target: { value: SECRETS.gatePasscode } });
    fireEvent.click(within(card).getByRole("button", { name: "Check in" }));
    await waitFor(async () =>
      expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
        "gate",
      ]),
    );
  });
  it("checks in, rejects a wrong passcode, unlocks prerequisites, and redeems a reward", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { publicConfig, persistence, network } = createTestBackend({
      config: createAdminConfig({ goodieStock: 10 }),
    });
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    render(<RallyViewer client={client} locale="en" nextAction={{ enabled: false }} />);
    expect(
      (
        await within(spotCard("Museum")).findByText("Complete Gate to unlock this spot.")
      ).getAttribute("role"),
    ).toBe("status");

    submitProof("Gate", "Passcode", "TYPO");
    expect((await within(spotCard("Gate")).findByRole("alert")).textContent).toBe(
      "Verification failed.",
    );
    expect(await persistence.getUserState(RALLY_ID, anonymousSessionId)).toBeNull();

    submitProof("Gate", "Passcode", SECRETS.gatePasscode);
    expect(await screen.findByText("Gate collected. 1/3 to complete.")).toBeTruthy();
    expect(within(spotCard("Gate")).getByText("CLAIMED")).toBeTruthy();
    expect(within(spotCard("Museum")).queryByText("Complete Gate to unlock this spot.")).toBeNull();

    expect(within(spotCard("Museum")).getByText(/QR scanning is not supported here/)).toBeTruthy();
    submitProof("Museum", "QR value", SECRETS.museumToken);
    expect(await screen.findByText("Museum collected. 2/3 to complete.")).toBeTruthy();

    fireEvent.click(
      within(rewardCard("Goodie bag")).getByRole("button", { name: "Redeem reward" }),
    );
    expect(persistence.getClaimRecords()).toHaveLength(0);
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

  it("waits for one location request before checking in with the server", async () => {
    const config = createAdminConfig();
    const gate = config.spots[0];
    if (gate === undefined) throw new Error("Missing gate");
    const { publicConfig, persistence, network } = createTestBackend({
      config: {
        ...config,
        spots: [
          {
            ...gate,
            conditions: [{ type: "gps", latitude: 35, longitude: 139, radiusMeters: 100 }],
          },
        ],
      },
    });
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    let reportPosition: PositionCallback | undefined;
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      reportPosition = success;
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    render(<RallyViewer client={client} locale="en" nextAction={{ enabled: false }} />);
    const button = within(spotCard("Gate")).getByRole("button", { name: "Check location" });
    fireEvent.click(button);
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    const coords = {
      latitude: 35,
      longitude: 139,
      accuracy: 1,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    };
    act(() => reportPosition?.({ coords, timestamp: Date.now(), toJSON: () => ({}) }));
    await waitFor(async () =>
      expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
        "gate",
      ]),
    );
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
