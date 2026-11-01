import {
  offlineOperationId,
  type SyncAdapter,
  type SyncLifecycleEvent,
  type SyncProgressResponse,
  type UserRallyState,
} from "@stamprally/core";
import { describe, expect, it } from "vitest";
import { createAdminConfig, createTestBackend, RALLY_ID, SECRETS } from "./support/backend.js";
import { createTestDevice, type TestDevice } from "./support/device.js";
import { rewardStatus, stampIds } from "./support/state.js";

function recordSyncEvents(device: TestDevice): SyncLifecycleEvent[] {
  const events: SyncLifecycleEvent[] = [];
  device.client.subscribeSyncEvents((event) => events.push(event));
  return events;
}

function eventTypes(events: ReadonlyArray<SyncLifecycleEvent>): ReadonlyArray<string> {
  return events.map(({ type }) => type);
}

function ticketNumber(state: UserRallyState | null | undefined, rewardId: string) {
  return state?.rewards.find((reward) => reward.rewardId === rewardId)?.claimTicketNumber;
}

describe("offline queue → reconnect → server replay", () => {
  it("queues check-ins while offline and replays them in order after reconnecting", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const device = createTestDevice({ publicConfig, network });
    const { client, anonymousSessionId } = device;
    const events = recordSyncEvents(device);
    network.setOffline(true);

    expect((await client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);
    expect((await client.checkIn("museum", SECRETS.museumToken)).ok).toBe(true);
    expect(client.pendingCount).toBe(2);
    expect(rewardStatus(client.getState(), "goodie")).toBe("AVAILABLE");
    expect(await persistence.getUserState(RALLY_ID, anonymousSessionId)).toBeNull();

    network.setOffline(false);
    await client.sync();

    expect(client.pendingCount).toBe(0);
    expect(client.syncState).toBe("idle");
    const serverState = await persistence.getUserState(RALLY_ID, anonymousSessionId);
    expect(stampIds(serverState)).toEqual(["gate", "museum"]);
    expect(client.getState()?.records).toEqual(serverState?.records);
    expect(eventTypes(events)).toEqual([
      "SYNC_STARTED",
      "OPERATION_ACCEPTED",
      "OPERATION_ACCEPTED",
      "SYNC_COMPLETED",
    ]);
    expect(events.at(-1)).toEqual({ type: "SYNC_COMPLETED", totalProcessed: 2, failedCount: 0 });
    expect(network.exchanges.map(({ path, outcome }) => [path.split("/").at(-1), outcome])).toEqual(
      [
        ["check-in", "network-error"],
        ["check-in", "network-error"],
        ["check-in", "delivered"],
        ["check-in", "delivered"],
        ["sync", "delivered"],
      ],
    );
  });

  it("rolls back a rejected offline check-in and every queued check-in depending on it", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const device = createTestDevice({ publicConfig, network });
    const { client, anonymousSessionId } = device;
    const events = recordSyncEvents(device);
    network.setOffline(true);
    await client.checkIn("gate", "TYPO");
    await client.checkIn("museum", SECRETS.museumToken);
    expect(stampIds(client.getState())).toEqual(["gate", "museum"]);

    network.setOffline(false);
    await client.sync();

    expect(client.pendingCount).toBe(0);
    expect(stampIds(client.getState())).toEqual([]);
    expect(rewardStatus(client.getState(), "goodie")).toBe("LOCKED");
    expect(client.rejectedHistory.map(({ errorCode }) => errorCode)).toEqual([
      "INVALID_PROOF",
      "REJECTED_PREREQUISITE_FAILED",
    ]);
    expect(events.filter(({ type }) => type === "OPERATION_ROLLED_BACK")).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: "SYNC_COMPLETED", totalProcessed: 2, failedCount: 2 });
    expect(
      network.exchangesTo("/check-in").filter(({ outcome }) => outcome === "delivered"),
    ).toEqual([expect.objectContaining({ status: 422 })]);
    expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([]);
  });

  it("keeps operations queued after a retryable failure and succeeds on a later sync", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const device = createTestDevice({ publicConfig, network });
    const { client, offlineQueue, anonymousSessionId } = device;
    const events = recordSyncEvents(device);
    network.setOffline(true);
    await client.checkIn("gate", SECRETS.gatePasscode);

    network.setOffline(false);
    network.failNextRequests(1);
    await expect(client.sync()).rejects.toThrow("Failed to fetch");

    expect(client.syncState).toBe("error");
    expect(client.pendingCount).toBe(1);
    expect(offlineQueue.operations[0]?.status).toBe("FAILED_RETRYABLE");
    expect(eventTypes(events)).toContain("OPERATION_RETRYABLE_ERROR");
    expect(stampIds(client.getState())).toEqual(["gate"]);

    await client.sync();

    expect(client.syncState).toBe("idle");
    expect(client.pendingCount).toBe(0);
    expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
      "gate",
    ]);
  });

  it("retries transient failures with backoff inside a single sync", async () => {
    const { publicConfig, network } = createTestBackend();
    const { client } = createTestDevice({
      publicConfig,
      network,
      retryOptions: { maxRetries: 2, initialIntervalMs: 0, backoffMultiplier: 1 },
    });
    network.setOffline(true);
    await client.checkIn("gate", SECRETS.gatePasscode);

    network.setOffline(false);
    network.failNextRequests(2);
    await client.sync();

    expect(client.pendingCount).toBe(0);
    expect(network.exchangesTo("/check-in").map(({ outcome }) => outcome)).toEqual([
      "network-error",
      "network-error",
      "network-error",
      "delivered",
    ]);
  });

  it("does not apply a check-in twice when the response is lost after the server commits", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    network.loseNextResponses(1);

    expect((await client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);
    expect(client.pendingCount).toBe(1);
    expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
      "gate",
    ]);

    await client.sync();

    expect(client.pendingCount).toBe(0);
    expect(client.rejectedHistory).toEqual([]);
    expect(stampIds(client.getState())).toEqual(["gate"]);
    const checkInAudits = persistence.getAuditLogs().filter(({ action }) => action === "CHECK_IN");
    expect(checkInAudits).toHaveLength(1);
  });

  it("does not consume stock twice when a claim response is lost after the server commits", async () => {
    const backend = createTestBackend({ config: createAdminConfig({ goodieStock: 5 }) });
    const { publicConfig, persistence, network } = backend;
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });
    await client.checkIn("gate", SECRETS.gatePasscode);
    await client.checkIn("museum", SECRETS.museumToken);
    network.loseNextResponses(1);

    expect((await client.claimReward("goodie")).ok).toBe(true);
    expect(client.pendingCount).toBe(1);
    expect(await persistence.getRewardStock(RALLY_ID, "goodie")).toBe(4);

    await client.sync();

    expect(client.pendingCount).toBe(0);
    expect(await persistence.getRewardStock(RALLY_ID, "goodie")).toBe(4);
    expect(persistence.getClaimRecords()).toHaveLength(1);
    const serverState = await persistence.getUserState(RALLY_ID, anonymousSessionId);
    expect(ticketNumber(client.getState(), "goodie")).toBe(ticketNumber(serverState, "goodie"));
    expect(client.getState()?.inventory?.rewardRemaining?.goodie).toBe(4);
  });

  it("restores the queue after a reload and syncs it from the new page", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const firstPage = createTestDevice({ publicConfig, network });
    network.setOffline(true);
    await firstPage.client.checkIn("gate", SECRETS.gatePasscode);

    const { storage, queueStorage, anonymousSessionId } = firstPage;
    const reloaded = createTestDevice({
      publicConfig,
      network,
      storage,
      queueStorage,
      anonymousSessionId,
    });
    expect(stampIds(await reloaded.client.init())).toEqual(["gate"]);
    expect(reloaded.client.pendingCount).toBe(1);

    network.setOffline(false);
    await reloaded.client.sync();

    expect(reloaded.client.pendingCount).toBe(0);
    expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
      "gate",
    ]);
  });

  it("keeps server-verified progress after a reload while offline", async () => {
    const { publicConfig, network } = createTestBackend();
    const firstPage = createTestDevice({ publicConfig, network });
    expect((await firstPage.client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);

    network.setOffline(true);
    const { storage, queueStorage, anonymousSessionId } = firstPage;
    const reloaded = createTestDevice({
      publicConfig,
      network,
      storage,
      queueStorage,
      anonymousSessionId,
    });

    expect(stampIds(await reloaded.client.init())).toEqual(["gate"]);
    expect((await reloaded.client.checkIn("museum", SECRETS.museumToken)).ok).toBe(true);
  });

  it("keeps a server-verified reward claim after an offline reload without allowing another claim", async () => {
    const { publicConfig, persistence, network } = createTestBackend({
      config: createAdminConfig({ goodieStock: 5 }),
    });
    const firstPage = createTestDevice({ publicConfig, network });
    expect((await firstPage.client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);
    expect((await firstPage.client.checkIn("museum", SECRETS.museumToken)).ok).toBe(true);
    expect((await firstPage.client.claimReward("goodie")).ok).toBe(true);
    const { storage, queueStorage, anonymousSessionId } = firstPage;
    const serverState = await persistence.getUserState(RALLY_ID, anonymousSessionId);
    const requestCount = network.exchanges.length;
    network.setOffline(true);

    const reloaded = createTestDevice({
      publicConfig,
      network,
      storage,
      queueStorage,
      anonymousSessionId,
    });
    const restored = await reloaded.client.init();

    expect(stampIds(restored)).toEqual(["gate", "museum"]);
    expect(rewardStatus(restored, "goodie")).toBe("CONSUMED");
    expect(ticketNumber(restored, "goodie")).toEqual(expect.any(String));
    expect(ticketNumber(restored, "goodie")).toBe(ticketNumber(serverState, "goodie"));
    expect(restored.inventory?.rewardRemaining?.goodie).toBe(4);
    expect(await reloaded.client.claimReward("goodie")).toMatchObject({
      ok: false,
      error: { code: "ALREADY_CONSUMED" },
    });
    expect(reloaded.client.pendingCount).toBe(0);
    expect(network.exchanges).toHaveLength(requestCount);
    expect(persistence.getClaimRecords()).toHaveLength(1);
  });

  describe("batch sync through /sync", () => {
    it("sends the whole queue in one request and settles each operation by id", async () => {
      const { publicConfig, persistence, network } = createTestBackend();
      const device = createTestDevice({ publicConfig, network });
      const { client, adapter, offlineQueue, anonymousSessionId } = device;
      network.setOffline(true);
      await client.checkIn("gate", SECRETS.gatePasscode);
      await client.checkIn("tower", "TYPO");
      const [gateOperationId, towerOperationId] = offlineQueue.operations.map(offlineOperationId);
      const responses: SyncProgressResponse[] = [];
      const batch: SyncAdapter = {
        sync: async (request) => {
          const response = await adapter.sync(request);
          if ("results" in response) responses.push(response);
          return response;
        },
      };

      network.setOffline(false);
      await client.sync(batch);

      expect(network.exchangesTo("/sync")).toHaveLength(1);
      expect(network.exchangesTo("/sync")[0]?.body).toMatchObject({
        rallyId: RALLY_ID,
        operations: [{ kind: "checkIn" }, { kind: "checkIn" }],
      });
      const settled = new Map(
        responses[0]?.results.map(({ operationId, status }) => [operationId, status]),
      );
      expect(settled).toEqual(
        new Map([
          [gateOperationId, "ACCEPTED"],
          [towerOperationId, "REJECTED_PERMANENT"],
        ]),
      );
      expect(client.pendingCount).toBe(0);
      expect(client.rejectedHistory).toMatchObject([
        { errorCode: "INVALID_PROOF", operation: { request: { spotId: "tower" } } },
      ]);
      expect(stampIds(client.getState())).toEqual(["gate"]);
      expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
        "gate",
      ]);
    });
  });
});
