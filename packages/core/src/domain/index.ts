export type {
  CompositeConditionFailure,
  ConditionMatch,
  ConditionMismatch,
  CustomValidationContext,
  CustomValidator,
  Result,
  StampError,
  Validator,
  VerificationContext,
} from "./errors.js";
export { resolveLocalizedText, toLocalizedString, updateLocalizedField } from "./i18n.js";
export type {
  AdminRallyConfig,
  CheckInCondition,
  ExternalReference,
  FontFamily,
  LocaleDictionary,
  LocalizedString,
  LocalizedText,
  PublicCheckInCondition,
  PublicRallyConfig,
  PublicReward,
  PublicSpotItem,
  RallyConfig,
  RedemptionMethod,
  Reward,
  RewardState,
  RewardStatus,
  RewardType,
  RewardUnlockCondition,
  SheetTheme,
  SlotShape,
  SpotItem,
  StampRallyState,
  StampRecord,
  SupportedLocale,
  ThemePreset,
  ThemePresetId,
  UserRallyState,
} from "./models.js";
export {
  assertPublicConfig,
  DEFAULT_SHEET_THEME,
  isPublicConfig,
  toPublicConfig,
} from "./models.js";
export { THEME_PRESETS } from "./themePresets.js";
export type { ParseResult, ValidationError } from "./validation.js";
export {
  ConfigValidationError,
  parseAdminConfig,
  parsePublicConfig,
  safeParseAdminConfig,
  safeParsePublicConfig,
} from "./validation.js";
