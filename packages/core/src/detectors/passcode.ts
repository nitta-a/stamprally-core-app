import type { CheckInResult, PasscodeCondition } from "./types.js";

export function normalizePasscode(input: string, caseSensitive = false): string {
  const normalized = input.normalize("NFKC").trim();
  return caseSensitive ? normalized : normalized.toUpperCase();
}

export function verifyPasscode(inputCode: string, condition: PasscodeCondition): CheckInResult {
  const input = normalizePasscode(inputCode, condition.caseSensitive);
  const expected = normalizePasscode(condition.passcode, condition.caseSensitive);

  return input === expected
    ? { success: true }
    : {
        success: false,
        reason: "INVALID_PASSCODE",
        message: "The passcode is invalid.",
      };
}
