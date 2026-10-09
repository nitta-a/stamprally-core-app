import type {
  AdminRallyConfig,
  CheckInCondition,
  CheckInResult,
  StampError,
  VerificationContext,
} from "@stamprally/core";
import { processStamp, StampRallyClient, toPublicConfig } from "@stamprally/core";

const ERROR_MESSAGES: Record<StampError["code"], string> = {
  SPOT_NOT_FOUND: "スポットが見つかりません。",
  STAMP_ALREADY_ACQUIRED: "このスタンプは取得済みです。",
  PREREQUISITES_NOT_MET: "先に必要なスポットのスタンプを集めてください。",
  INVALID_PROOF: "合言葉を確認して、もう一度お試しください。",
  CUSTOM_VALIDATION_FAILED: "このデモでは、この確認方法を利用できません。",
};

function verificationContext(
  proof: unknown,
  condition: CheckInCondition | undefined,
): VerificationContext | null {
  if (typeof proof === "string") {
    if (condition?.type === "passcode") return { type: "passcode", code: proof };
    if (condition?.type === "qr") return { type: "qr", token: proof };
    if (condition?.type === "nfc") return { type: "nfc", tagId: proof };
    return null;
  }
  if (typeof proof !== "object" || proof === null || !("type" in proof)) return null;
  if (proof.type === "passcode" && "code" in proof && typeof proof.code === "string")
    return { type: "passcode", code: proof.code };
  if (proof.type === "qr" && "token" in proof && typeof proof.token === "string")
    return { type: "qr", token: proof.token };
  if (proof.type === "nfc" && "tagId" in proof && typeof proof.tagId === "string")
    return { type: "nfc", tagId: proof.tagId };
  if (
    proof.type === "gps" &&
    "latitude" in proof &&
    "longitude" in proof &&
    typeof proof.latitude === "number" &&
    typeof proof.longitude === "number"
  )
    return { type: "gps", latitude: proof.latitude, longitude: proof.longitude };
  return null;
}

export function createDemoClient(config: AdminRallyConfig): StampRallyClient {
  const publicConfig = toPublicConfig(config);
  return new StampRallyClient(publicConfig, {
    syncAdapter: {
      checkIn: async ({ spotId, proofData, state, now }): Promise<CheckInResult> => {
        const spot = config.spots.find((candidate) => candidate.id === spotId);
        const context = verificationContext(proofData, spot?.conditions[0]);
        if (context === null)
          return {
            ok: false,
            error: { code: "INVALID_PROOF", spotId, message: ERROR_MESSAGES.INVALID_PROOF },
          };
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
    },
  });
}
