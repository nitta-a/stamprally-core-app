import type {
  AdminRallyConfig,
  CheckInCondition,
  PublicRallyConfig,
  Reward,
  RewardUnlockCondition,
  SheetTheme,
} from "./models.js";

export interface ValidationError {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly errors: ReadonlyArray<ValidationError> };

export class ConfigValidationError extends Error {
  readonly name = "ConfigValidationError";
  constructor(readonly errors: ReadonlyArray<ValidationError>) {
    super(errors.map((error) => `${error.path}: ${error.message}`).join("; "));
  }
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: RecordValue, key: string): boolean {
  return Object.hasOwn(value, key);
}

function add(errors: ValidationError[], path: string, message: string, code: string): void {
  errors.push({ path, message, code });
}

function requiredString(
  value: RecordValue,
  key: string,
  path: string,
  errors: ValidationError[],
): boolean {
  if (typeof value[key] !== "string" || value[key].length === 0) {
    add(errors, `${path}.${key}`, "A non-empty string is required.", "required_string");
    return false;
  }
  return true;
}

function optionalString(
  value: RecordValue,
  key: string,
  path: string,
  errors: ValidationError[],
): void {
  if (hasOwn(value, key) && value[key] !== undefined && typeof value[key] !== "string")
    add(errors, `${path}.${key}`, "Expected a string.", "invalid_type");
}

function optionalBoolean(
  value: RecordValue,
  key: string,
  path: string,
  errors: ValidationError[],
): void {
  if (hasOwn(value, key) && value[key] !== undefined && typeof value[key] !== "boolean")
    add(errors, `${path}.${key}`, "Expected a boolean.", "invalid_type");
}

function finiteNumber(
  value: RecordValue,
  key: string,
  path: string,
  errors: ValidationError[],
  minimum?: number,
): void {
  const item = value[key];
  if (typeof item !== "number" || !Number.isFinite(item)) {
    add(errors, `${path}.${key}`, "Expected a finite number.", "invalid_number");
  } else if (minimum !== undefined && item < minimum) {
    add(
      errors,
      `${path}.${key}`,
      `Expected a number greater than or equal to ${minimum}.`,
      "out_of_range",
    );
  }
}

function localizedText(value: unknown, path: string, errors: ValidationError[]): void {
  if (typeof value === "string") return;
  if (!isRecord(value)) {
    add(errors, path, "Expected a string or a locale map.", "invalid_localized_text");
    return;
  }
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text !== "string")
      add(errors, `${path}.${locale}`, "Expected a string.", "invalid_type");
  }
}

function theme(value: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(value)) {
    add(errors, path, "Expected a theme object.", "invalid_type");
    return;
  }
  for (const key of ["primaryColor", "cardBackgroundColor", "textColor"])
    requiredString(value, key, path, errors);
  optionalString(value, "backgroundColor", path, errors);
  optionalString(value, "backgroundImageUrl", path, errors);
  optionalString(value, "completedStampColor", path, errors);
  optionalString(value, "fontFamily", path, errors);
  const slotShape = value.slotShape;
  if (slotShape !== "circle" && slotShape !== "square" && slotShape !== "rounded")
    add(errors, `${path}.slotShape`, "Expected circle, square, or rounded.", "invalid_enum");
  finiteNumber(value, "gridColumns", path, errors, 1);
  if (typeof value.gridColumns === "number" && !Number.isInteger(value.gridColumns))
    add(errors, `${path}.gridColumns`, "Expected an integer.", "invalid_integer");
  if (hasOwn(value, "unclaimedOpacity")) finiteNumber(value, "unclaimedOpacity", path, errors, 0);
}

function externalReferences(value: unknown, path: string, errors: ValidationError[]): void {
  if (!Array.isArray(value)) {
    add(errors, path, "Expected an array.", "invalid_type");
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      add(errors, itemPath, "Expected an object.", "invalid_type");
      return;
    }
    requiredString(item, "type", itemPath, errors);
    requiredString(item, "id", itemPath, errors);
    optionalString(item, "url", itemPath, errors);
  });
}

function condition(
  value: unknown,
  path: string,
  errors: ValidationError[],
  isPublic: boolean,
): void {
  if (!isRecord(value)) {
    add(errors, path, "Expected a condition object.", "invalid_type");
    return;
  }
  const type = value.type;
  if (type === "qr") {
    if (isPublic) {
      if (hasOwn(value, "secretToken"))
        add(errors, `${path}.secretToken`, "Private field is not allowed.", "private_field");
    } else requiredString(value, "secretToken", path, errors);
    optionalString(value, "qrEntryUrl", path, errors);
    return;
  }
  if (type === "passcode") {
    if (isPublic) {
      for (const key of ["code", "caseSensitive"])
        if (hasOwn(value, key))
          add(errors, `${path}.${key}`, "Private field is not allowed.", "private_field");
    } else {
      requiredString(value, "code", path, errors);
      optionalBoolean(value, "caseSensitive", path, errors);
    }
    return;
  }
  if (type === "gps") {
    finiteNumber(value, "latitude", path, errors);
    finiteNumber(value, "longitude", path, errors);
    finiteNumber(value, "radiusMeters", path, errors, 0);
    if (typeof value.latitude === "number" && (value.latitude < -90 || value.latitude > 90))
      add(errors, `${path}.latitude`, "Expected a latitude between -90 and 90.", "out_of_range");
    if (typeof value.longitude === "number" && (value.longitude < -180 || value.longitude > 180))
      add(
        errors,
        `${path}.longitude`,
        "Expected a longitude between -180 and 180.",
        "out_of_range",
      );
    return;
  }
  if (type === "nfc") {
    if (isPublic) {
      if (hasOwn(value, "tagId"))
        add(errors, `${path}.tagId`, "Private field is not allowed.", "private_field");
    } else requiredString(value, "tagId", path, errors);
    return;
  }
  if (type === "custom") {
    requiredString(value, "validatorName", path, errors);
    if (isPublic && hasOwn(value, "secretParams"))
      add(errors, `${path}.secretParams`, "Private field is not allowed.", "private_field");
    if (!isPublic && hasOwn(value, "secretParams") && !isRecord(value.secretParams))
      add(errors, `${path}.secretParams`, "Expected an object.", "invalid_type");
    return;
  }
  add(errors, `${path}.type`, "Unknown condition type.", "invalid_enum");
}

function unlockCondition(value: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(value)) {
    add(errors, path, "Expected an unlock condition object.", "invalid_type");
    return;
  }
  if (value.type === "stamp_count") {
    finiteNumber(value, "count", path, errors, 0);
    return;
  }
  if (value.type === "stamps") {
    if (!Array.isArray(value.stampIds))
      add(errors, `${path}.stampIds`, "Expected an array.", "invalid_type");
    else
      value.stampIds.forEach((item, index) => {
        if (typeof item !== "string" || item.length === 0)
          add(
            errors,
            `${path}.stampIds[${index}]`,
            "Expected a non-empty string.",
            "required_string",
          );
      });
    return;
  }
  if (value.type === "all" || value.type === "any") {
    if (!Array.isArray(value.conditions))
      add(errors, `${path}.conditions`, "Expected an array.", "invalid_type");
    else
      value.conditions.forEach((item, index) => {
        unlockCondition(item, `${path}.conditions[${index}]`, errors);
      });
    return;
  }
  add(errors, `${path}.type`, "Unknown unlock condition type.", "invalid_enum");
}

function spot(value: unknown, path: string, errors: ValidationError[], isPublic: boolean): void {
  if (!isRecord(value)) {
    add(errors, path, "Expected a spot object.", "invalid_type");
    return;
  }
  requiredString(value, "id", path, errors);
  finiteNumber(value, "orderIndex", path, errors, 0);
  if (typeof value.orderIndex === "number" && !Number.isInteger(value.orderIndex))
    add(errors, `${path}.orderIndex`, "Expected an integer.", "invalid_integer");
  localizedText(value.name, `${path}.name`, errors);
  for (const key of ["description", "hint"])
    if (hasOwn(value, key)) localizedText(value[key], `${path}.${key}`, errors);
  for (const key of ["imageUrl", "iconUrl", "redirectUrlAfterClaim"])
    optionalString(value, key, path, errors);
  if (hasOwn(value, "externalReferences") && value.externalReferences !== undefined)
    externalReferences(value.externalReferences, `${path}.externalReferences`, errors);
  if (hasOwn(value, "prerequisites") && value.prerequisites !== undefined) {
    if (!Array.isArray(value.prerequisites))
      add(errors, `${path}.prerequisites`, "Expected an array.", "invalid_type");
    else
      value.prerequisites.forEach((item, index) => {
        if (typeof item !== "string" || item.length === 0)
          add(
            errors,
            `${path}.prerequisites[${index}]`,
            "Expected a non-empty string.",
            "required_string",
          );
      });
  }
  if (!Array.isArray(value.conditions))
    add(errors, `${path}.conditions`, "Expected an array.", "invalid_type");
  else
    value.conditions.forEach((item, index) => {
      condition(item, `${path}.conditions[${index}]`, errors, isPublic);
    });
}

function reward(value: unknown, path: string, errors: ValidationError[], isPublic: boolean): void {
  if (!isRecord(value)) {
    add(errors, path, "Expected a reward object.", "invalid_type");
    return;
  }
  requiredString(value, "id", path, errors);
  localizedText(value.title, `${path}.title`, errors);
  if (hasOwn(value, "description")) localizedText(value.description, `${path}.description`, errors);
  if (value.type !== "digital" && value.type !== "in_person")
    add(errors, `${path}.type`, "Unknown reward type.", "invalid_enum");
  if (
    !["manual_slide", "staff_passcode", "view_only", "server_claim"].includes(
      String(value.redemptionMethod),
    )
  )
    add(errors, `${path}.redemptionMethod`, "Unknown redemption method.", "invalid_enum");
  finiteNumber(value, "requiredStampCount", path, errors, 0);
  for (const key of ["stockLimit", "userClaimLimit"]) {
    if (hasOwn(value, key) && value[key] !== undefined) {
      finiteNumber(value, key, path, errors, 0);
      if (typeof value[key] === "number" && !Number.isInteger(value[key]))
        add(errors, `${path}.${key}`, "Expected an integer.", "invalid_integer");
    }
  }
  optionalString(value, "validUntil", path, errors);
  if (typeof value.validUntil === "string" && Number.isNaN(Date.parse(value.validUntil)))
    add(errors, `${path}.validUntil`, "Expected a valid date string.", "invalid_date");
  if (isPublic) {
    for (const key of ["staffPasscode", "digitalContentUrl"])
      if (hasOwn(value, key))
        add(errors, `${path}.${key}`, "Private field is not allowed.", "private_field");
  } else {
    optionalString(value, "staffPasscode", path, errors);
    optionalString(value, "digitalContentUrl", path, errors);
  }
  if (hasOwn(value, "conditions") && value.conditions !== undefined) {
    if (!Array.isArray(value.conditions))
      add(errors, `${path}.conditions`, "Expected an array.", "invalid_type");
    else
      value.conditions.forEach((item, index) => {
        unlockCondition(item, `${path}.conditions[${index}]`, errors);
      });
  }
}

function validate(value: unknown, isPublic: boolean): ReadonlyArray<ValidationError> {
  const errors: ValidationError[] = [];
  if (!isRecord(value)) {
    add(errors, "$", "Expected a configuration object.", "invalid_type");
    return errors;
  }
  requiredString(value, "id", "$", errors);
  requiredString(value, "version", "$", errors);
  localizedText(value.title, "$.title", errors);
  if (hasOwn(value, "description")) localizedText(value.description, "$.description", errors);
  if (hasOwn(value, "theme") && value.theme !== undefined) theme(value.theme, "$.theme", errors);
  if (!Array.isArray(value.spots)) add(errors, "spots", "Expected an array.", "invalid_type");
  else
    value.spots.forEach((item, index) => {
      spot(item, `spots[${index}]`, errors, isPublic);
    });
  if (!Array.isArray(value.rewards)) add(errors, "rewards", "Expected an array.", "invalid_type");
  else
    value.rewards.forEach((item, index) => {
      reward(item, `rewards[${index}]`, errors, isPublic);
    });
  if (!isPublic) {
    optionalString(value, "staffPasscode", "$", errors);
    if (hasOwn(value, "inventory") && value.inventory !== undefined && !isRecord(value.inventory))
      add(errors, "$.inventory", "Expected an object.", "invalid_type");
    if (
      hasOwn(value, "serverMetadata") &&
      value.serverMetadata !== undefined &&
      !isRecord(value.serverMetadata)
    )
      add(errors, "$.serverMetadata", "Expected an object.", "invalid_type");
    if (
      hasOwn(value, "publicMetadata") &&
      value.publicMetadata !== undefined &&
      !isRecord(value.publicMetadata)
    )
      add(errors, "$.publicMetadata", "Expected an object.", "invalid_type");
    optionalString(value, "serverEndpoint", "$", errors);
  } else {
    for (const key of ["staffPasscode", "serverMetadata", "inventory"])
      if (hasOwn(value, key))
        add(errors, `$.${key}`, "Private field is not allowed.", "private_field");
    optionalString(value, "serverEndpoint", "$", errors);
  }
  return errors;
}

export function safeParseAdminConfig(input: unknown): ParseResult<AdminRallyConfig> {
  const errors = validate(input, false);
  return errors.length === 0
    ? { success: true, data: input as AdminRallyConfig }
    : { success: false, errors };
}

export function parseAdminConfig(input: unknown): AdminRallyConfig {
  const result = safeParseAdminConfig(input);
  if (!result.success) throw new ConfigValidationError(result.errors);
  return result.data;
}

export function safeParsePublicConfig(input: unknown): ParseResult<PublicRallyConfig> {
  const errors = validate(input, true);
  return errors.length === 0
    ? { success: true, data: input as PublicRallyConfig }
    : { success: false, errors };
}

export function parsePublicConfig(input: unknown): PublicRallyConfig {
  const result = safeParsePublicConfig(input);
  if (!result.success) throw new ConfigValidationError(result.errors);
  return result.data;
}

export type {
  AdminRallyConfig,
  CheckInCondition,
  PublicRallyConfig,
  Reward,
  RewardUnlockCondition,
  SheetTheme,
};
