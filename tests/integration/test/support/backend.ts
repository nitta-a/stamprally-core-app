import type { AdminRallyConfig, PublicRallyConfig } from "@stamprally/core";
import { toPublicConfig } from "@stamprally/core";
import {
  InMemoryServerPersistenceAdapter,
  type ServerOptions,
  StampRallyServer,
} from "@stamprally/server";
import { TestNetwork } from "./network.js";

export const RALLY_ID = "integration-rally";
export const BASE_URL = `https://rally.test/api/rallies/${RALLY_ID}`;

export const SECRETS = {
  gatePasscode: "GATE-OPEN",
  museumToken: "museum-qr-secret",
  towerPasscode: "TOWER-TOP",
  staffPasscode: "STAFF-7788",
  digitalContentUrl: "https://example.test/private/badge.png",
} as const;

export interface AdminConfigOptions {
  readonly goodieStock?: number;
}

/**
 * Three spots (one gated by a prerequisite) and three rewards covering server claims,
 * stamp-specific unlock conditions, and staff passcode redemption.
 */
export function createAdminConfig(options: AdminConfigOptions = {}): AdminRallyConfig {
  const { goodieStock } = options;
  return {
    id: RALLY_ID,
    version: "1.0.0",
    title: "Integration Rally",
    spots: [
      {
        id: "gate",
        orderIndex: 0,
        name: "Gate",
        conditions: [{ type: "passcode", code: SECRETS.gatePasscode }],
      },
      {
        id: "museum",
        orderIndex: 1,
        name: "Museum",
        conditions: [{ type: "qr", secretToken: SECRETS.museumToken }],
        prerequisites: ["gate"],
      },
      {
        id: "tower",
        orderIndex: 2,
        name: "Tower",
        conditions: [{ type: "passcode", code: SECRETS.towerPasscode }],
      },
    ],
    rewards: [
      {
        id: "goodie",
        title: "Goodie bag",
        type: "in_person",
        redemptionMethod: "server_claim",
        requiredStampCount: 2,
      },
      {
        id: "museum-badge",
        title: "Museum badge",
        type: "digital",
        redemptionMethod: "server_claim",
        requiredStampCount: 1,
        conditions: [{ type: "stamps", stampIds: ["museum"] }],
        digitalContentUrl: SECRETS.digitalContentUrl,
      },
      {
        id: "staff-gift",
        title: "Staff gift",
        type: "in_person",
        redemptionMethod: "staff_passcode",
        requiredStampCount: 3,
        staffPasscode: SECRETS.staffPasscode,
      },
    ],
    ...(goodieStock === undefined ? {} : { inventory: { goodie: goodieStock } }),
  };
}

export interface TestBackendOptions {
  readonly config?: AdminRallyConfig;
  readonly serverOptions?: ServerOptions;
}

export interface TestBackend {
  readonly config: AdminRallyConfig;
  readonly publicConfig: PublicRallyConfig;
  readonly persistence: InMemoryServerPersistenceAdapter;
  readonly server: StampRallyServer;
  readonly network: TestNetwork;
}

export function createTestBackend(options: TestBackendOptions = {}): TestBackend {
  const { config = createAdminConfig(), serverOptions = {} } = options;
  const persistence = new InMemoryServerPersistenceAdapter();
  const server = new StampRallyServer(config, persistence, serverOptions);
  const network = new TestNetwork((request) => server.handle(request));
  return { config, publicConfig: toPublicConfig(config), persistence, server, network };
}
