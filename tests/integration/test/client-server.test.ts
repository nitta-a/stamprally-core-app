import { isPublicConfig } from "@stamprally/core";
import type { TrustedAuthContext } from "@stamprally/server";
import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAdminConfig,
  createTestBackend,
  RALLY_ID,
  SECRETS,
  type TestBackend,
} from "./support/backend.js";
import { createTestDevice, type TestDevice } from "./support/device.js";
import { rewardStatus, stampIds } from "./support/state.js";

const TOKENS: Readonly<Record<string, string>> = {
  "Bearer token-alice": "alice",
  "Bearer token-bob": "bob",
};

function authenticate(request: Request): string | TrustedAuthContext | null {
  return TOKENS[request.headers.get("authorization") ?? ""] ?? null;
}

async function completeGoodieRequirements(device: TestDevice): Promise<void> {
  const { client } = device;
  expect((await client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);
  expect((await client.checkIn("museum", SECRETS.museumToken)).ok).toBe(true);
}

async function postJson(
  backend: TestBackend,
  path: string,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return backend.network.fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("client ↔ HTTP ↔ server ↔ persistence", () => {
  it("completes an anonymous journey and persists every step on the server", async () => {
    const backend = createTestBackend();
    const { publicConfig, persistence, network } = backend;
    const device = createTestDevice({ publicConfig, network });
    const { client, anonymousSessionId } = device;
    await client.init();

    const gate = await client.checkIn("gate", SECRETS.gatePasscode);
    expect(gate.ok).toBe(true);
    expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([
      "gate",
    ]);
    expect(rewardStatus(client.getState(), "goodie")).toBe("LOCKED");

    const museum = await client.checkIn("museum", { type: "qr", token: SECRETS.museumToken });
    expect(museum.ok).toBe(true);
    expect(rewardStatus(client.getState(), "goodie")).toBe("AVAILABLE");

    const claim = await client.claimReward("goodie");
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect(claim.value.reward).toMatchObject({ status: "CONSUMED" });
    expect(claim.value.reward.claimTicketNumber).toEqual(expect.any(String));

    const serverState = await persistence.getUserState(RALLY_ID, anonymousSessionId);
    expect(stampIds(serverState)).toEqual(["gate", "museum"]);
    expect(rewardStatus(serverState, "goodie")).toBe("CONSUMED");
    expect(client.getState()?.records).toEqual(serverState?.records);
    expect(client.pendingCount).toBe(0);

    expect(network.exchanges.map(({ path, status }) => [path, status])).toEqual([
      [`/api/rallies/${RALLY_ID}/check-in`, 200],
      [`/api/rallies/${RALLY_ID}/check-in`, 200],
      [`/api/rallies/${RALLY_ID}/claim-reward`, 200],
    ]);
    for (const exchange of network.exchanges)
      expect(exchange.headers["x-anonymous-session-id"]).toBe(anonymousSessionId);

    const audit = persistence.getAuditLogs();
    expect(audit.map(({ action, resourceId, status }) => [action, resourceId, status])).toEqual([
      ["CHECK_IN", "gate", "SUCCESS"],
      ["CHECK_IN", "museum", "SUCCESS"],
      ["CLAIM_REWARD", "goodie", "SUCCESS"],
    ]);
    expect(audit.every(({ userId }) => userId === anonymousSessionId)).toBe(true);
    expect(persistence.getClaimRecords()).toHaveLength(1);
  });

  it("lets the server reject proofs the client cannot verify, without leaking secrets", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const { client, anonymousSessionId } = createTestDevice({ publicConfig, network });

    const result = await client.checkIn("gate", "WRONG-CODE");

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_PROOF", spotId: "gate" } });
    expect(stampIds(client.getState())).toEqual([]);
    expect(client.pendingCount).toBe(0);
    expect(stampIds(await persistence.getUserState(RALLY_ID, anonymousSessionId))).toEqual([]);
    expect(network.exchangesTo("/check-in")).toMatchObject([{ status: 422 }]);

    const audit = persistence.getAuditLogs();
    expect(audit).toMatchObject([
      { action: "CHECK_IN", status: "REJECTED", metadata: { errorCode: "INVALID_PROOF" } },
    ]);
    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain("WRONG-CODE");
    expect(serializedAudit).not.toContain(SECRETS.gatePasscode);
  });

  it("validates prerequisites locally before making a network round trip", async () => {
    const { publicConfig, network } = createTestBackend();
    const { client } = createTestDevice({ publicConfig, network });

    const result = await client.checkIn("museum", SECRETS.museumToken);

    expect(result).toMatchObject({ ok: false, error: { code: "PREREQUISITES_NOT_MET" } });
    expect(network.exchanges).toHaveLength(0);
  });

  it("ships a public configuration without any server-side secret", () => {
    const { publicConfig } = createTestBackend();
    const serialized = JSON.stringify(publicConfig);

    expect(isPublicConfig(publicConfig)).toBe(true);
    for (const secret of Object.values(SECRETS)) expect(serialized).not.toContain(secret);
  });

  it("verifies staff passcodes on the server even though clients never receive them", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const device = createTestDevice({ publicConfig, network });
    const { client } = device;
    await completeGoodieRequirements(device);
    expect((await client.checkIn("tower", SECRETS.towerPasscode)).ok).toBe(true);
    expect(rewardStatus(client.getState(), "staff-gift")).toBe("AVAILABLE");

    const rejected = await client.claimReward("staff-gift", { staffPasscode: "0000" });
    expect(rejected).toMatchObject({ ok: false, error: { code: "INVALID_PASSCODE" } });
    expect(rewardStatus(client.getState(), "staff-gift")).toBe("AVAILABLE");

    const accepted = await client.claimReward("staff-gift", {
      staffPasscode: SECRETS.staffPasscode,
      staffId: "staff-01",
    });
    expect(accepted).toMatchObject({
      ok: true,
      value: { reward: { status: "CONSUMED", consumedByStaffId: "staff-01" } },
    });
    expect(JSON.stringify(persistence.getAuditLogs())).not.toContain(SECRETS.staffPasscode);
  });

  it("unlocks stamp-specific rewards identically on the client and the server", async () => {
    const { publicConfig, persistence, network } = createTestBackend();
    const device = createTestDevice({ publicConfig, network });
    const { client, anonymousSessionId } = device;

    await completeGoodieRequirements(device);

    expect(
      rewardStatus(await persistence.getUserState(RALLY_ID, anonymousSessionId), "museum-badge"),
    ).toBe("AVAILABLE");
    expect(rewardStatus(client.getState(), "museum-badge")).toBe("AVAILABLE");
    expect((await client.claimReward("museum-badge")).ok).toBe(true);
  });

  describe("identity", () => {
    it("rejects anonymous requests without a valid UUID v4 session header", async () => {
      const backend = createTestBackend();
      const body = {
        rallyId: RALLY_ID,
        spotId: "gate",
        idempotencyKey: "anonymous-1",
        context: { type: "passcode", code: SECRETS.gatePasscode },
      };

      const missing = await postJson(backend, "/check-in", body);
      const malformed = await postJson(backend, "/check-in", body, {
        "x-anonymous-session-id": "not-a-uuid",
      });

      expect(missing.status).toBe(401);
      expect(malformed.status).toBe(401);
      expect(await missing.json()).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
      expect(backend.persistence.getAuditLogs()).toEqual([]);
    });

    it("binds progress to the authenticated user and ignores a spoofed body userId", async () => {
      const backend = createTestBackend({ serverOptions: { authenticate } });
      const { publicConfig, persistence, network } = backend;
      const { client } = createTestDevice({
        publicConfig,
        network,
        userId: "alice",
        headers: { authorization: "Bearer token-alice" },
      });

      expect((await client.checkIn("gate", SECRETS.gatePasscode)).ok).toBe(true);
      expect(network.exchanges[0]?.headers["x-anonymous-session-id"]).toBeUndefined();

      const spoofed = await postJson(
        backend,
        "/check-in",
        {
          rallyId: RALLY_ID,
          userId: "bob",
          spotId: "tower",
          idempotencyKey: "spoof-1",
          context: { type: "passcode", code: SECRETS.towerPasscode },
        },
        { authorization: "Bearer token-alice" },
      );
      expect(spoofed.status).toBe(200);
      expect(stampIds(await persistence.getUserState(RALLY_ID, "alice"))).toEqual([
        "gate",
        "tower",
      ]);
      expect(await persistence.getUserState(RALLY_ID, "bob")).toBeNull();

      const unauthenticated = await postJson(backend, "/sync", { rallyId: RALLY_ID });
      expect(unauthenticated.status).toBe(401);
    });

    it("restores server-authoritative progress on a second device of the same user", async () => {
      const { publicConfig, network } = createTestBackend({ serverOptions: { authenticate } });
      const deviceOptions = {
        publicConfig,
        network,
        userId: "alice",
        headers: { authorization: "Bearer token-alice" },
      };
      const phone = createTestDevice(deviceOptions);
      await completeGoodieRequirements(phone);
      expect((await phone.client.claimReward("goodie")).ok).toBe(true);

      const tablet = createTestDevice(deviceOptions);
      expect(stampIds(await tablet.client.init())).toEqual([]);
      await tablet.client.sync();

      expect(stampIds(tablet.client.getState())).toEqual(["gate", "museum"]);
      expect(rewardStatus(tablet.client.getState(), "goodie")).toBe("CONSUMED");
      const retry = await tablet.client.claimReward("goodie");
      expect(retry).toMatchObject({ ok: false, error: { code: "ALREADY_CONSUMED" } });
    });
  });

  describe("reward inventory", () => {
    it("rejects a claim once the shared stock is exhausted by another participant", async () => {
      const backend = createTestBackend({ config: createAdminConfig({ goodieStock: 1 }) });
      const { publicConfig, persistence, network } = backend;
      const first = createTestDevice({ publicConfig, network });
      const second = createTestDevice({ publicConfig, network });
      await completeGoodieRequirements(first);
      await completeGoodieRequirements(second);

      expect((await first.client.claimReward("goodie")).ok).toBe(true);
      const late = await second.client.claimReward("goodie");

      expect(late).toMatchObject({ ok: false, error: { code: "OUT_OF_STOCK" } });
      expect(rewardStatus(second.client.getState(), "goodie")).toBe("AVAILABLE");
      expect(await persistence.getRewardStock(RALLY_ID, "goodie")).toBe(0);
      expect(persistence.getClaimRecords()).toHaveLength(1);
    });

    it("converges to exactly one winner when claims race for the last item", async () => {
      const backend = createTestBackend({ config: createAdminConfig({ goodieStock: 1 }) });
      const { publicConfig, persistence, network } = backend;
      const devices = [
        createTestDevice({ publicConfig, network }),
        createTestDevice({ publicConfig, network }),
        createTestDevice({ publicConfig, network }),
      ];
      for (const device of devices) await completeGoodieRequirements(device);

      await Promise.all(devices.map(({ client }) => client.claimReward("goodie")));
      for (const { client } of devices) await client.sync();

      const consumed = devices.filter(
        ({ client }) => rewardStatus(client.getState(), "goodie") === "CONSUMED",
      );
      expect(consumed).toHaveLength(1);
      for (const { client } of devices) expect(client.pendingCount).toBe(0);
      expect(await persistence.getRewardStock(RALLY_ID, "goodie")).toBe(0);
      expect(persistence.getClaimRecords()).toHaveLength(1);
    });
  });
});
