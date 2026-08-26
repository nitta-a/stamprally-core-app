export const CURRENT_RALLY_CONFIG_VERSION = 2;

export interface ValidationError {
  readonly path: string;
  readonly code:
    | "INVALID_TYPE"
    | "REQUIRED"
    | "EMPTY_STRING"
    | "DUPLICATE_ID"
    | "INVALID_COORDINATES"
    | "INVALID_RADIUS"
    | "INVALID_DATE"
    | "INVALID_VERSION"
    | "INVALID_REWARD"
    | "CYCLE_DETECTED";
  readonly message: string;
}

export interface RallyConfigValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<ValidationError>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function add(
  errors: ValidationError[],
  path: string,
  code: ValidationError["code"],
  message: string,
): void {
  errors.push({ path, code, message });
}

function hasText(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (!isObject(value)) return false;
  return Object.values(value).some((item) => typeof item === "string" && item.trim() !== "");
}

function validateCondition(value: unknown, path: string, errors: ValidationError[]): void {
  if (!isObject(value) || typeof value.type !== "string") {
    add(errors, path, "INVALID_TYPE", "Condition must be an object with a type.");
    return;
  }
  switch (value.type) {
    case "instant":
      return;
    case "token":
      if (typeof value.token !== "string" || value.token.trim() === "") {
        add(errors, `${path}.token`, "REQUIRED", "Token must not be empty.");
      }
      return;
    case "geo": {
      const latitude = value.latitude;
      const longitude = value.longitude;
      if (
        typeof latitude !== "number" ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        typeof longitude !== "number" ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        add(
          errors,
          path,
          "INVALID_COORDINATES",
          "Latitude must be between -90 and 90 and longitude between -180 and 180.",
        );
      }
      if (
        typeof value.radiusMeters !== "number" ||
        !Number.isFinite(value.radiusMeters) ||
        value.radiusMeters <= 0
      ) {
        add(errors, `${path}.radiusMeters`, "INVALID_RADIUS", "Radius must be greater than zero.");
      }
      return;
    }
    case "composite":
      if (value.operator !== "AND" && value.operator !== "OR") {
        add(errors, `${path}.operator`, "INVALID_TYPE", "Operator must be AND or OR.");
      }
      if (!Array.isArray(value.conditions)) {
        add(errors, `${path}.conditions`, "INVALID_TYPE", "Composite conditions must be an array.");
        return;
      }
      value.conditions.forEach((child, index) => {
        validateCondition(child, `${path}.conditions[${index}]`, errors);
      });
      return;
    case "time_window":
      if (typeof value.startsAt !== "string" || Number.isNaN(Date.parse(value.startsAt))) {
        add(errors, `${path}.startsAt`, "INVALID_DATE", "Start must be a valid ISO date.");
      }
      if (typeof value.endsAt !== "string" || Number.isNaN(Date.parse(value.endsAt))) {
        add(errors, `${path}.endsAt`, "INVALID_DATE", "End must be a valid ISO date.");
      }
      if (
        typeof value.startsAt === "string" &&
        typeof value.endsAt === "string" &&
        !Number.isNaN(Date.parse(value.startsAt)) &&
        !Number.isNaN(Date.parse(value.endsAt)) &&
        Date.parse(value.startsAt) >= Date.parse(value.endsAt)
      ) {
        add(errors, path, "INVALID_DATE", "Time window start must be before its end.");
      }
      validateCondition(value.condition, `${path}.condition`, errors);
      return;
    default:
      add(errors, `${path}.type`, "INVALID_TYPE", "Unsupported condition type.");
  }
}

function validateSpot(value: unknown, index: number, errors: ValidationError[]): void {
  const path = `stamps[${index}]`;
  if (!isObject(value)) {
    add(errors, path, "INVALID_TYPE", "Spot must be an object.");
    return;
  }
  if (typeof value.id !== "string") add(errors, `${path}.id`, "REQUIRED", "Spot ID is required.");
  else if (value.id.trim() === "")
    add(errors, `${path}.id`, "EMPTY_STRING", "Spot ID must not be empty.");
  if (value.name === undefined) add(errors, `${path}.name`, "REQUIRED", "Spot name is required.");
  else if (!hasText(value.name))
    add(errors, `${path}.name`, "EMPTY_STRING", "Spot name must not be empty.");
  if (
    value.order !== undefined &&
    (typeof value.order !== "number" || !Number.isFinite(value.order))
  ) {
    add(errors, `${path}.order`, "INVALID_TYPE", "Spot order must be a finite number.");
  }
  validateCondition(value.condition, `${path}.condition`, errors);
  for (const field of ["dependsOn", "requiresStampIds"] as const) {
    if (
      value[field] !== undefined &&
      (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== "string"))
    ) {
      add(errors, `${path}.${field}`, "INVALID_TYPE", `${field} must be an array of IDs.`);
    }
  }
}

function validateReward(
  value: unknown,
  index: number,
  stampCount: number,
  errors: ValidationError[],
): void {
  const path = `rewards[${index}]`;
  if (!isObject(value)) {
    add(errors, path, "INVALID_TYPE", "Reward must be an object.");
    return;
  }
  if (typeof value.id !== "string" || value.id.trim() === "") {
    add(errors, `${path}.id`, "REQUIRED", "Reward ID must not be empty.");
  }
  if (!hasText(value.title)) {
    add(errors, `${path}.title`, "EMPTY_STRING", "Reward title must not be empty.");
  }
  if (!hasText(value.description)) {
    add(errors, `${path}.description`, "EMPTY_STRING", "Reward description must not be empty.");
  }
  const required = value.requiredStampCount;
  if (
    typeof required !== "number" ||
    !Number.isInteger(required) ||
    required < 0 ||
    required > stampCount
  ) {
    add(
      errors,
      `${path}.requiredStampCount`,
      "INVALID_REWARD",
      "Required stamps must be an integer within the rally.",
    );
  }
  if (
    value.validUntil !== undefined &&
    (typeof value.validUntil !== "string" || Number.isNaN(Date.parse(value.validUntil)))
  ) {
    add(errors, `${path}.validUntil`, "INVALID_DATE", "Reward expiry must be a valid ISO date.");
  }
  for (const field of ["maxStock", "limitPerUser"] as const) {
    const count = value[field];
    if (
      count !== undefined &&
      (typeof count !== "number" || !Number.isInteger(count) || count <= 0)
    ) {
      add(errors, `${path}.${field}`, "INVALID_REWARD", `${field} must be a positive integer.`);
    }
  }
}

function collectDependencies(spot: Record<string, unknown>): ReadonlyArray<string> {
  const dependencies = new Set<string>();
  for (const field of ["dependsOn", "requiresStampIds"] as const) {
    const values = spot[field];
    if (Array.isArray(values))
      for (const value of values) if (typeof value === "string") dependencies.add(value);
  }
  return [...dependencies];
}

function validateDag(stamps: ReadonlyArray<unknown>, errors: ValidationError[]): void {
  const graph = new Map<string, ReadonlyArray<string>>();
  for (const value of stamps) {
    if (!isObject(value) || typeof value.id !== "string") continue;
    graph.set(value.id, [...(graph.get(value.id) ?? []), ...collectDependencies(value)]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string): void => {
    if (visiting.has(id)) {
      add(errors, path, "CYCLE_DETECTED", `Dependency cycle detected at '${id}'.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? [])
      if (graph.has(dependency)) visit(dependency, path);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id, `stamps[${id}]`);
}

export function validateRallyConfig(config: unknown): RallyConfigValidationResult {
  const errors: ValidationError[] = [];
  if (!isObject(config))
    return {
      valid: false,
      errors: [{ path: "", code: "INVALID_TYPE", message: "Rally config must be an object." }],
    };
  if (typeof config.id !== "string") add(errors, "id", "REQUIRED", "Rally ID is required.");
  else if (config.id.trim() === "")
    add(errors, "id", "EMPTY_STRING", "Rally ID must not be empty.");
  if (config.title !== undefined && !hasText(config.title))
    add(errors, "title", "EMPTY_STRING", "Rally title must not be empty.");
  if (config.version !== undefined && config.version !== CURRENT_RALLY_CONFIG_VERSION) {
    add(
      errors,
      "version",
      "INVALID_VERSION",
      `Config version must be ${CURRENT_RALLY_CONFIG_VERSION}.`,
    );
  }
  for (const field of ["startDate", "endDate"] as const) {
    if (
      config[field] !== undefined &&
      (typeof config[field] !== "string" || Number.isNaN(Date.parse(config[field] as string)))
    ) {
      add(errors, field, "INVALID_DATE", `${field} must be a valid ISO date.`);
    }
  }
  if (
    typeof config.startDate === "string" &&
    typeof config.endDate === "string" &&
    !Number.isNaN(Date.parse(config.startDate)) &&
    !Number.isNaN(Date.parse(config.endDate)) &&
    Date.parse(config.startDate) >= Date.parse(config.endDate)
  ) {
    add(errors, "startDate", "INVALID_DATE", "startDate must be before endDate.");
  }
  if (!Array.isArray(config.stamps)) {
    add(errors, "stamps", "INVALID_TYPE", "stamps must be an array.");
  } else {
    config.stamps.forEach((spot, index) => {
      validateSpot(spot, index, errors);
    });
    const ids = config.stamps.map((spot) =>
      isObject(spot) && typeof spot.id === "string" ? spot.id : "",
    );
    ids.forEach((id, index) => {
      if (id !== "" && ids.indexOf(id) !== index)
        add(errors, `stamps[${index}].id`, "DUPLICATE_ID", `Duplicate spot ID '${id}'.`);
    });
    validateDag(config.stamps, errors);
  }
  if (config.rewards !== undefined && !Array.isArray(config.rewards)) {
    add(errors, "rewards", "INVALID_TYPE", "rewards must be an array.");
  } else if (Array.isArray(config.rewards)) {
    const stampCount = Array.isArray(config.stamps) ? config.stamps.length : 0;
    config.rewards.forEach((reward, index) => {
      validateReward(reward, index, stampCount, errors);
    });
    const ids = config.rewards.map((reward) =>
      isObject(reward) && typeof reward.id === "string" ? reward.id : "",
    );
    ids.forEach((id, index) => {
      if (id !== "" && ids.indexOf(id) !== index)
        add(errors, `rewards[${index}].id`, "DUPLICATE_ID", `Duplicate reward ID '${id}'.`);
    });
    if (Array.isArray(config.stamps)) {
      const stampIds = new Set(
        config.stamps.map((spot) => (isObject(spot) && typeof spot.id === "string" ? spot.id : "")),
      );
      ids.forEach((id, index) => {
        if (id !== "" && stampIds.has(id))
          add(
            errors,
            `rewards[${index}].id`,
            "DUPLICATE_ID",
            `Reward ID '${id}' is already used by a spot.`,
          );
      });
    }
  }
  return { valid: errors.length === 0, errors };
}
