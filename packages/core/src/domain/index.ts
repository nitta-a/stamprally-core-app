export type { StampCondition, VerificationContext } from "./conditions.js";
export type {
  CompositeConditionFailure,
  ConditionMatch,
  ConditionMismatch,
  Result,
  StampError,
} from "./errors.js";
export { resolveLocalizedText, toLocalizedString } from "./i18n.js";
export { migrateRallyConfig } from "./migration.js";
export type {
  FontFamily,
  LocalizedString,
  LocalizedText,
  RallyConfig,
  RedemptionMethod,
  RewardItem,
  RewardState,
  RewardStatus,
  RewardType,
  SheetTheme,
  SlotShape,
  SpotItem,
  StampDefinition,
  StampRallyState,
  StampRecord,
  SupportedLocale,
  ThemePreset,
  ThemePresetId,
} from "./models.js";
export { DEFAULT_SHEET_THEME } from "./models.js";
export type { PublicRallyConfig, PublicRewardItem } from "./publicConfig.js";
export { stripSensitiveConfig } from "./publicConfig.js";
export { THEME_PRESETS } from "./themePresets.js";
export type { RallyConfigValidationResult, ValidationError } from "./validation.js";
export { CURRENT_RALLY_CONFIG_VERSION, validateRallyConfig } from "./validation.js";
