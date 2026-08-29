import { describe, expect, it } from "vitest";
import type {
  AuditLog,
  ClaimRewardTransactionMutation,
  ClaimRewardTransactionParams,
  UserRallyState,
} from "../src/index.js";
import {
  executeClaimRewardTransaction,
  type SqlClaimRewardStore,
  type SqlTransactionDatabase,
} from "../src/index.js";

type Transaction = { readonly writes: string[] };

function fixture() {
  const committed: string[] = [];
  const database: SqlTransactionDatabase<Transaction> = {
    async transaction(operation) {
      const pending: string[] = [];
      try {
        const result = await operation({ writes: pending });
        committed.push(...pending);
        return result;
      } catch (error) {
        pending.length = 0;
        throw error;
      }
    },
  };
  const store: SqlClaimRewardStore<Transaction> = {
    async readContext() {
      return {
        stock: 1,
        claimCount: 0,
        userState: {
          rallyId: "rally",
          userId: "alice",
          records: [],
          rewards: [{ rewardId: "reward", status: "AVAILABLE" as const }],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      };
    },
    async writeStock(transaction, _params, nextStock) {
      transaction.writes.push(`stock:${nextStock}`);
    },
    async writeUserState(transaction) {
      transaction.writes.push("state");
    },
    async writeClaimRecord(transaction) {
      transaction.writes.push("claim");
    },
    async writeAudit(transaction, _log: AuditLog) {
      transaction.writes.push("audit");
    },
    async writeIdempotency(transaction) {
      transaction.writes.push("idempotency");
    },
  };
  return { committed, database, store };
}

const params: ClaimRewardTransactionParams = {
  rallyId: "rally",
  userId: "alice",
  rewardId: "reward",
  ticketNumber: "ticket-1",
  timestamp: Date.parse("2026-01-01T00:00:00.000Z"),
  idempotencyKey: "claim-1",
  rewardStockLimit: 1,
  sharedStockLimit: null,
};

const mutation = (current: {
  readonly stock: number | null;
  readonly claimCount: number;
  readonly userState: UserRallyState;
}): ClaimRewardTransactionMutation => ({
  nextStock: (current.stock ?? 1) - 1,
  nextUserState: { ...current.userState, updatedAt: "2026-01-01T00:00:01.000Z" },
  auditLog: {
    id: "audit-1",
    timestamp: "2026-01-01T00:00:01.000Z",
    rallyId: "rally",
    userId: "alice",
    action: "CLAIM_REWARD" as const,
    resourceId: "reward",
    status: "SUCCESS" as const,
    idempotencyKey: "claim-1",
  },
  result: { ok: true },
});

describe("executeClaimRewardTransaction reference", () => {
  it("commits all claim writes together", async () => {
    const { committed, database, store } = fixture();
    const result = await executeClaimRewardTransaction(database, store, params, mutation);
    expect(result).toEqual({ success: true });
    expect(committed).toEqual(["stock:0", "state", "claim", "audit", "idempotency"]);
  });

  it("rolls back every write when a commit operation fails", async () => {
    const fixtureValue = fixture();
    const failingStore: SqlClaimRewardStore<Transaction> = {
      ...fixtureValue.store,
      async writeAudit(transaction) {
        transaction.writes.push("audit");
        throw new Error("audit unavailable");
      },
    };
    const result = await executeClaimRewardTransaction(
      fixtureValue.database,
      failingStore,
      params,
      mutation,
    );
    expect(result).toEqual({ success: false, error: "audit unavailable" });
    expect(fixtureValue.committed).toEqual([]);
  });
});
