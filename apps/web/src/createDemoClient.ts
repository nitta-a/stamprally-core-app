import type {
  AdminRallyConfig,
  CheckInCondition,
  CheckInResult,
  ClaimResult,
  Reward,
  StampError,
  VerificationContext,
} from "@stamprally/core";
import {
  consumeReward,
  evaluateConditionDetailed,
  processStamp,
  StampRallyClient,
  toPublicConfig,
} from "@stamprally/core";

const ERROR_MESSAGES: Record<StampError["code"], string> = {
  SPOT_NOT_FOUND: "スポットが見つかりません。",
  STAMP_ALREADY_ACQUIRED: "このスタンプは取得済みです。",
  PREREQUISITES_NOT_MET: "先に必要なスポットのスタンプを集めてください。",
  INVALID_PROOF: "合言葉を確認して、もう一度お試しください。",
  CUSTOM_VALIDATION_FAILED: "このデモでは、この確認方法を利用できません。",
};

const INVALID_STAFF_PASSCODE_MESSAGE = "スタッフ確認用コードを確認して、もう一度お試しください。";

function candidateContexts(
  proof: unknown,
  conditions: ReadonlyArray<CheckInCondition>,
): ReadonlyArray<VerificationContext> {
  if (typeof proof === "string") {
    const types = new Set(conditions.map(({ type }) => type));
    const contexts: VerificationContext[] = [];
    if (types.has("passcode")) contexts.push({ type: "passcode", code: proof });
    if (types.has("qr")) contexts.push({ type: "qr", token: proof });
    if (types.has("nfc")) contexts.push({ type: "nfc", tagId: proof });
    return contexts;
  }
  if (typeof proof !== "object" || proof === null || !("type" in proof)) return [];
  if (proof.type === "passcode" && "code" in proof && typeof proof.code === "string")
    return [{ type: "passcode", code: proof.code }];
  if (proof.type === "qr" && "token" in proof && typeof proof.token === "string")
    return [{ type: "qr", token: proof.token }];
  if (proof.type === "nfc" && "tagId" in proof && typeof proof.tagId === "string")
    return [{ type: "nfc", tagId: proof.tagId }];
  if (
    proof.type === "gps" &&
    "latitude" in proof &&
    "longitude" in proof &&
    typeof proof.latitude === "number" &&
    typeof proof.longitude === "number"
  )
    return [{ type: "gps", latitude: proof.latitude, longitude: proof.longitude }];
  return [];
}

function selectVerificationContext(
  proof: unknown,
  conditions: ReadonlyArray<CheckInCondition>,
): VerificationContext | null {
  const candidates = candidateContexts(proof, conditions);
  for (const candidate of candidates) {
    if (
      conditions.some(
        (condition) =>
          condition.type !== "custom" && evaluateConditionDetailed(condition, candidate).ok,
      )
    )
      return candidate;
  }
  return candidates[0] ?? null;
}

function effectiveReward(config: AdminRallyConfig, reward: Reward): Reward {
  if (reward.staffPasscode === undefined && config.staffPasscode !== undefined)
    return { ...reward, staffPasscode: config.staffPasscode };
  return reward;
}

export function createDemoClient(config: AdminRallyConfig): StampRallyClient {
  const publicConfig = toPublicConfig(config);
  return new StampRallyClient(publicConfig, {
    syncAdapter: {
      checkIn: async ({ spotId, proofData, state, now }): Promise<CheckInResult> => {
        const spot = config.spots.find((candidate) => candidate.id === spotId);
        if (spot === undefined)
          return {
            ok: false,
            error: { code: "SPOT_NOT_FOUND", spotId, message: ERROR_MESSAGES.SPOT_NOT_FOUND },
          };
        const context =
          spot.conditions.length === 0
            ? ({ type: "custom", value: proofData } as const)
            : selectVerificationContext(proofData, spot.conditions);
        if (context === null) {
          const isCustomOnly = spot.conditions.every(({ type }) => type === "custom");
          const code = isCustomOnly ? "CUSTOM_VALIDATION_FAILED" : "INVALID_PROOF";
          return {
            ok: false,
            error: { code, spotId, message: ERROR_MESSAGES[code] },
          };
        }
        const result = processStamp(state, config, spotId, context, now);
        if (!result.ok) {
          const { error } = result;
          return { ok: false, error: { ...error, message: ERROR_MESSAGES[error.code] } };
        }
        const { nextState, events } = result.value;
        const event = events[0];
        if (event === undefined)
          return {
            ok: false,
            error: { code: "SYNC_FAILED", message: "スタンプの記録に失敗しました。" },
          };
        return { ok: true, value: { state: nextState, record: event.record } };
      },
      claimReward: async ({ rewardId, state, now, options }): Promise<ClaimResult> => {
        const configured = config.rewards.find((candidate) => candidate.id === rewardId);
        if (configured === undefined)
          return {
            ok: false,
            error: {
              code: "REWARD_NOT_FOUND",
              rewardId,
              message: "特典が見つかりません。",
            },
          };
        const currentReward = state.rewards.find(
          (candidate) => candidate.rewardId === rewardId,
        ) ?? {
          rewardId,
          status: "LOCKED" as const,
        };
        const reward = effectiveReward(config, configured);
        if (reward.redemptionMethod === "staff_passcode" && reward.staffPasscode === undefined)
          return {
            ok: false,
            error: {
              code: "INVALID_PASSCODE",
              rewardId,
              message: INVALID_STAFF_PASSCODE_MESSAGE,
            },
          };
        const result = consumeReward({
          reward,
          currentState: currentReward,
          now,
          ...(options.staffPasscode === undefined ? {} : { inputPasscode: options.staffPasscode }),
          ...(options.staffId === undefined ? {} : { staffId: options.staffId }),
        });
        if (!result.ok) {
          const { error } = result;
          if (error.code === "INVALID_PASSCODE")
            return {
              ok: false,
              error: { ...error, message: INVALID_STAFF_PASSCODE_MESSAGE },
            };
          return { ok: false, error };
        }
        const nextRewards = state.rewards.some((candidate) => candidate.rewardId === rewardId)
          ? state.rewards.map((candidate) =>
              candidate.rewardId === rewardId ? result.value : candidate,
            )
          : [...state.rewards, result.value];
        const nextState = { ...state, rewards: nextRewards, updatedAt: now };
        return { ok: true, value: { state: nextState, reward: result.value } };
      },
    },
  });
}
