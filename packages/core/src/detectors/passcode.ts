export interface PasscodeCondition {
  readonly code: string;
  readonly caseSensitive?: boolean;
}
export interface PasscodeCheckResult {
  readonly success: boolean;
  readonly message?: string;
}
export function normalizePasscode(input: string, caseSensitive = false): string {
  const normalized = input.normalize("NFKC").trim();
  return caseSensitive ? normalized : normalized.toUpperCase();
}
export function verifyPasscode(
  inputCode: string,
  condition: PasscodeCondition,
): PasscodeCheckResult {
  return normalizePasscode(inputCode, condition.caseSensitive) ===
    normalizePasscode(condition.code, condition.caseSensitive)
    ? { success: true }
    : { success: false, message: "The passcode is invalid." };
}
