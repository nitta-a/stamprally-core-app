import type {
  AdminRallyConfig,
  PublicRallyConfig,
  VerificationCondition,
} from "./universalModel.js";

export interface UniversalValidationError {
  readonly path: string;
  readonly code:
    | "INVALID_TYPE"
    | "REQUIRED"
    | "EMPTY_STRING"
    | "DUPLICATE_ID"
    | "INVALID_COORDINATES"
    | "INVALID_RADIUS"
    | "INVALID_VERSION"
    | "INVALID_REWARD"
    | "CYCLE_DETECTED"
    | "SECRET_IN_PUBLIC_CONFIG";
  readonly message: string;
}

export interface UniversalValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<UniversalValidationError>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function add(
  errors: UniversalValidationError[],
  path: string,
  code: UniversalValidationError["code"],
  message: string,
): void {
  errors.push({ path, code, message });
}

function hasText(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  return (
    isObject(value) &&
    Object.values(value).some((item) => typeof item === "string" && item.trim() !== "")
  );
}

function validateCondition(
  condition: unknown,
  path: string,
  errors: UniversalValidationError[],
): void {
  if (!isObject(condition) || typeof condition.type !== "string") {
    add(errors, path, "INVALID_TYPE", "Condition must have a type.");
    return;
  }
  switch (condition.type) {
    case "qr":
      if (typeof condition.secretToken !== "string" || condition.secretToken.trim() === "")
        add(errors, `${path}.secretToken`, "REQUIRED", "QR secretToken is required.");
      if (condition.qrEntryUrl !== undefined && typeof condition.qrEntryUrl !== "string")
        add(errors, `${path}.qrEntryUrl`, "INVALID_TYPE", "QR entry URL must be a string.");
      return;
    case "passcode":
      if (typeof condition.code !== "string" || condition.code.trim() === "")
        add(errors, `${path}.code`, "REQUIRED", "Passcode is required.");
      return;
    case "gps":
      if (
        typeof condition.latitude !== "number" ||
        !Number.isFinite(condition.latitude) ||
        condition.latitude < -90 ||
        condition.latitude > 90 ||
        typeof condition.longitude !== "number" ||
        !Number.isFinite(condition.longitude) ||
        condition.longitude < -180 ||
        condition.longitude > 180
      )
        add(errors, path, "INVALID_COORDINATES", "GPS coordinates are invalid.");
      if (
        typeof condition.radiusMeters !== "number" ||
        !Number.isFinite(condition.radiusMeters) ||
        condition.radiusMeters <= 0
      )
        add(errors, `${path}.radiusMeters`, "INVALID_RADIUS", "GPS radius must be positive.");
      return;
    case "custom":
      if (typeof condition.validatorName !== "string" || condition.validatorName.trim() === "")
        add(errors, `${path}.validatorName`, "REQUIRED", "Custom validatorName is required.");
      return;
    default:
      add(errors, `${path}.type`, "INVALID_TYPE", "Unsupported verification condition.");
  }
}

function validateDag(spots: ReadonlyArray<unknown>, errors: UniversalValidationError[]): void {
  const graph = new Map<string, ReadonlyArray<string>>();
  for (const spot of spots) {
    if (!isObject(spot) || typeof spot.id !== "string") continue;
    const prerequisites = Array.isArray(spot.prerequisites)
      ? spot.prerequisites.filter((item): item is string => typeof item === "string")
      : [];
    graph.set(spot.id, prerequisites);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      add(
        errors,
        `spots.${id}.prerequisites`,
        "CYCLE_DETECTED",
        `Dependency cycle detected at '${id}'.`,
      );
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of graph.get(id) ?? [])
      if (graph.has(prerequisite)) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

export function validateAdminRallyConfig(value: unknown): UniversalValidationResult {
  const errors: UniversalValidationError[] = [];
  if (!isObject(value))
    return {
      valid: false,
      errors: [{ path: "", code: "INVALID_TYPE", message: "Admin config must be an object." }],
    };
  if (typeof value.id !== "string" || value.id.trim() === "")
    add(errors, "id", "REQUIRED", "Rally ID is required.");
  if (typeof value.version !== "string" || value.version.trim() === "")
    add(errors, "version", "INVALID_VERSION", "Version is required.");
  if (!Array.isArray(value.spots)) {
    add(errors, "spots", "INVALID_TYPE", "spots must be an array.");
  } else {
    const ids: string[] = [];
    value.spots.forEach((spot, index) => {
      const path = `spots[${index}]`;
      if (!isObject(spot)) {
        add(errors, path, "INVALID_TYPE", "Spot must be an object.");
        return;
      }
      if (typeof spot.id !== "string" || spot.id.trim() === "")
        add(errors, `${path}.id`, "REQUIRED", "Spot ID is required.");
      else if (ids.includes(spot.id))
        add(errors, `${path}.id`, "DUPLICATE_ID", `Duplicate spot ID '${spot.id}'.`);
      else ids.push(spot.id);
      if (!hasText(spot.name)) add(errors, `${path}.name`, "REQUIRED", "Spot name is required.");
      if (typeof spot.orderIndex !== "number" || !Number.isInteger(spot.orderIndex))
        add(errors, `${path}.orderIndex`, "INVALID_TYPE", "orderIndex must be an integer.");
      if (!Array.isArray(spot.conditions) || spot.conditions.length === 0)
        add(errors, `${path}.conditions`, "REQUIRED", "At least one condition is required.");
      else {
        spot.conditions.forEach((condition, conditionIndex) => {
          validateCondition(condition, `${path}.conditions[${conditionIndex}]`, errors);
        });
      }
    });
    validateDag(value.spots, errors);
  }
  if (!Array.isArray(value.rewards))
    add(errors, "rewards", "INVALID_TYPE", "rewards must be an array.");
  else {
    const ids: string[] = [];
    value.rewards.forEach((reward, index) => {
      const path = `rewards[${index}]`;
      if (!isObject(reward)) {
        add(errors, path, "INVALID_TYPE", "Reward must be an object.");
        return;
      }
      if (typeof reward.id !== "string" || reward.id.trim() === "")
        add(errors, `${path}.id`, "REQUIRED", "Reward ID is required.");
      else if (ids.includes(reward.id))
        add(errors, `${path}.id`, "DUPLICATE_ID", `Duplicate reward ID '${reward.id}'.`);
      else ids.push(reward.id);
      if (!hasText(reward.title))
        add(errors, `${path}.title`, "REQUIRED", "Reward title is required.");
      if (
        typeof reward.requiredStampCount !== "number" ||
        !Number.isInteger(reward.requiredStampCount) ||
        reward.requiredStampCount < 0
      )
        add(
          errors,
          `${path}.requiredStampCount`,
          "INVALID_REWARD",
          "requiredStampCount must be a non-negative integer.",
        );
    });
  }
  return { valid: errors.length === 0, errors };
}

export function validatePublicRallyConfig(value: unknown): UniversalValidationResult {
  const errors: UniversalValidationError[] = [];
  if (!isObject(value))
    return {
      valid: false,
      errors: [{ path: "", code: "INVALID_TYPE", message: "Public config must be an object." }],
    };
  if ("secretKey" in value || "verificationSecrets" in value)
    add(
      errors,
      "",
      "SECRET_IN_PUBLIC_CONFIG",
      "Public config must not contain server verification secrets.",
    );
  if (!Array.isArray(value.spots)) add(errors, "spots", "INVALID_TYPE", "spots must be an array.");
  else
    value.spots.forEach((spot, index) => {
      if (!isObject(spot) || !Array.isArray(spot.conditions)) return;
      spot.conditions.forEach((condition, conditionIndex) => {
        if (!isObject(condition)) return;
        if ("secretToken" in condition || "code" in condition || "secretParams" in condition)
          add(
            errors,
            `spots[${index}].conditions[${conditionIndex}]`,
            "SECRET_IN_PUBLIC_CONFIG",
            "Public condition contains verification secret material.",
          );
      });
    });
  return { valid: errors.length === 0, errors };
}

export function isAdminRallyConfig(value: unknown): value is AdminRallyConfig {
  return validateAdminRallyConfig(value).valid;
}

export function isPublicRallyConfigShape(value: unknown): value is PublicRallyConfig {
  return validatePublicRallyConfig(value).valid;
}

export type { VerificationCondition };
