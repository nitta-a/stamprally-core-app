export type { CheckInContext, CheckInErrorCode, CheckInInput, CheckInResult } from "./checkIn.js";
export { evaluateCheckIn } from "./checkIn.js";
export {
  calculateDistanceMeters,
  evaluateCondition,
  evaluateConditionDetailed,
} from "./evaluate.js";
export type { StampRallyProgress } from "./progress.js";
export { calculateProgress } from "./progress.js";
export type { ClaimTicketOptions } from "./rewards.js";
export { createClaimTicketNumber, issueClaimTicketNumber } from "./rewards.js";
export type {
  ConsumeResult,
  ConsumeRewardParams,
  ProcessStampValue,
  RewardConsumeError,
  StampRallyEvent,
} from "./transition.js";
export { consumeReward, processStamp, reconcileRewardStates } from "./transition.js";
