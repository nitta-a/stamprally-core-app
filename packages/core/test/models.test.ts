import { describe, expect, it } from "vitest";
import type {
  AuditLoggerAdapter,
  AuthContextAdapter,
  ConditionVerifierPlugin,
  EventPublisherAdapter,
  IdGeneratorAdapter,
  RallyDefinition,
  RallyId,
  RallyProgress,
  ServerRallyConfig,
  SpotId,
  SpotVerificationSecret,
  StateMigrator,
  StorageAdapter,
  StorageSaveOutcome,
  SystemClockAdapter,
  UserId,
  ValidationInput,
} from "../src/models.js";

const rallyId = "rally-1" as RallyId;
const spotId = "spot-1" as SpotId;
const userId = "user-1" as UserId;

const definition: RallyDefinition = {
  id: rallyId,
  title: { default: "Stamp rally", translations: { ja: "スタンプラリー" } },
  spots: [
    {
      id: spotId,
      name: { default: "First spot", translations: {} },
      verification: { pluginId: "passcode" },
    },
  ],
};

const progress: RallyProgress = {
  rallyId,
  userId,
  stamps: [],
  stateSequence: 0,
  schemaVersion: 1,
  updatedAt: "2026-08-28T00:00:00.000Z",
};

class MemoryStorage implements StorageAdapter {
  async load(_rallyId: RallyId, _userId: UserId): Promise<RallyProgress | null> {
    return progress;
  }

  async save(_request: {
    readonly progress: RallyProgress;
    readonly expectedStateSequence: number;
    readonly idempotencyKey: string;
  }): Promise<StorageSaveOutcome> {
    return { status: "saved", progress, idempotent: false };
  }
}

class PasscodePlugin implements ConditionVerifierPlugin<string> {
  readonly id = "passcode";

  verify(input: ValidationInput<string>, _secret: SpotVerificationSecret) {
    return input.proof === "accepted"
      ? ({ valid: true } as const)
      : ({ valid: false, code: "INVALID_PROOF" } as const);
  }
}

const auth: AuthContextAdapter<{ readonly userId: UserId }> = {
  getUserId: (request) => request.userId,
};
const audit: AuditLoggerAdapter = { logCheckInAttempt: async () => undefined };
const events: EventPublisherAdapter = { publish: async () => undefined };
const clock: SystemClockAdapter = { now: () => "2026-08-28T00:00:00.000Z" };
const ids: IdGeneratorAdapter = { generate: () => "generated-id" };
const migrator: StateMigrator = {
  migrate: (state) => state as RallyProgress,
};

describe("headless core model contracts", () => {
  it("supports DI for storage, verification, and infrastructure adapters", async () => {
    const serverConfig: ServerRallyConfig = {
      definition,
      verificationSecrets: [{ spotId, pluginId: "passcode", expectedValue: "accepted" }],
      schemaVersion: 1,
    };
    const plugin = new PasscodePlugin();
    const secret = serverConfig.verificationSecrets[0];
    if (secret === undefined) throw new Error("Test secret is missing.");
    const outcome = plugin.verify(
      {
        rallyId,
        spotId,
        userId,
        proof: "accepted",
        requestedAt: clock.now(),
      },
      secret,
    );
    const storage = new MemoryStorage();
    const saved = await storage.save({
      progress,
      expectedStateSequence: 0,
      idempotencyKey: ids.generate(),
    });
    await auth.getUserId({ userId });
    await audit.logCheckInAttempt({
      rallyId,
      spotId,
      userId,
      attemptedAt: clock.now(),
      outcome,
    });
    await events.publish({
      type: "stampAcquired",
      rallyId,
      spotId,
      userId,
      record: { stampId: spotId, acquiredAt: clock.now() },
    });
    expect(saved.status).toBe("saved");
    expect(migrator.migrate(progress, 1, 1)).toBe(progress);
  });
});
