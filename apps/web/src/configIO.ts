import {
  type LocalizedString,
  type LocalizedText,
  type RallyConfig,
  type RewardItem,
  type SpotItem,
  type StampCondition,
  toLocalizedString,
} from "@stamprally/core";

export const DRAFT_CONFIG_KEY = "stamprally:editor-draft:v1";
export const PUBLISHED_CONFIG_KEY = "stamprally:published-config:v1";
const MAX_CONDITION_DEPTH = 8;

export type ConfigParseResult =
  | { readonly ok: true; readonly config: RallyConfig }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseText(
  value: unknown,
  path: string,
  required: boolean,
  errors: string[],
): LocalizedString {
  if (typeof value === "string") return { ja: value, en: "" };
  if (isObject(value) && typeof value.ja === "string" && typeof value.en === "string") {
    return { ja: value.ja, en: value.en };
  }
  if (!required && value === undefined) return { ja: "", en: "" };
  errors.push(`${path} must be a string or { ja, en } object.`);
  return { ja: "", en: "" };
}

function finiteNumber(value: unknown, path: string, errors: string[]): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  errors.push(`${path} must be a finite number.`);
  return 0;
}

function parseCondition(
  value: unknown,
  path: string,
  depth: number,
  errors: string[],
): StampCondition {
  if (depth > MAX_CONDITION_DEPTH) {
    errors.push(`${path} exceeds the maximum condition depth of ${MAX_CONDITION_DEPTH}.`);
    return { type: "instant" };
  }
  if (!isObject(value) || typeof value.type !== "string") {
    errors.push(`${path} must be a condition object.`);
    return { type: "instant" };
  }
  switch (value.type) {
    case "instant":
      return { type: "instant" };
    case "token":
      if (typeof value.token !== "string" || value.token.trim() === "") {
        errors.push(`${path}.token is required.`);
      }
      return { type: "token", token: typeof value.token === "string" ? value.token : "" };
    case "geo": {
      const latitude = finiteNumber(value.latitude, `${path}.latitude`, errors);
      const longitude = finiteNumber(value.longitude, `${path}.longitude`, errors);
      const radiusMeters = finiteNumber(value.radiusMeters, `${path}.radiusMeters`, errors);
      if (latitude < -90 || latitude > 90) errors.push(`${path}.latitude is out of range.`);
      if (longitude < -180 || longitude > 180) errors.push(`${path}.longitude is out of range.`);
      if (radiusMeters <= 0) errors.push(`${path}.radiusMeters must be greater than zero.`);
      return { type: "geo", latitude, longitude, radiusMeters };
    }
    case "composite": {
      if (value.operator !== "AND" && value.operator !== "OR") {
        errors.push(`${path}.operator must be AND or OR.`);
      }
      if (!Array.isArray(value.conditions)) errors.push(`${path}.conditions must be an array.`);
      return {
        type: "composite",
        operator: value.operator === "OR" ? "OR" : "AND",
        conditions: Array.isArray(value.conditions)
          ? value.conditions.map((child, index) =>
              parseCondition(child, `${path}.conditions[${index}]`, depth + 1, errors),
            )
          : [],
      };
    }
    case "time_window": {
      const startsAt = typeof value.startsAt === "string" ? value.startsAt : "";
      const endsAt = typeof value.endsAt === "string" ? value.endsAt : "";
      const start = Date.parse(startsAt);
      const end = Date.parse(endsAt);
      if (Number.isNaN(start)) errors.push(`${path}.startsAt must be an ISO date.`);
      if (Number.isNaN(end)) errors.push(`${path}.endsAt must be an ISO date.`);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start > end) {
        errors.push(`${path}.startsAt must not be after endsAt.`);
      }
      return {
        type: "time_window",
        startsAt,
        endsAt,
        condition: parseCondition(value.condition, `${path}.condition`, depth + 1, errors),
      };
    }
    default:
      errors.push(`${path}.type is unsupported.`);
      return { type: "instant" };
  }
}

function parseSpot(value: unknown, index: number, errors: string[]): SpotItem {
  const path = `stamps[${index}]`;
  if (!isObject(value)) {
    errors.push(`${path} must be an object.`);
    return { id: "", name: { ja: "", en: "" }, condition: { type: "instant" } };
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (id === "") errors.push(`${path}.id is required.`);
  const name = parseText(value.name, `${path}.name`, true, errors);
  if (name.ja.trim() === "") errors.push(`${path}.name.ja is required.`);
  const description = parseText(value.description, `${path}.description`, false, errors);
  const hint = parseText(value.hint, `${path}.hint`, false, errors);
  const order =
    value.order === undefined ? undefined : finiteNumber(value.order, `${path}.order`, errors);
  return {
    id,
    name,
    ...(description.ja === "" && description.en === "" ? {} : { description }),
    ...(hint.ja === "" && hint.en === "" ? {} : { hint }),
    condition: parseCondition(value.condition, `${path}.condition`, 1, errors),
    ...(order === undefined ? {} : { order }),
  };
}

function parseReward(value: unknown, index: number, errors: string[]): RewardItem {
  const path = `rewards[${index}]`;
  if (!isObject(value)) {
    errors.push(`${path} must be an object.`);
    return {
      id: "",
      title: { ja: "", en: "" },
      description: { ja: "", en: "" },
      type: "in_person",
      redemptionMethod: "manual_slide",
      requiredStampCount: 0,
    };
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (id === "") errors.push(`${path}.id is required.`);
  const title = parseText(value.title, `${path}.title`, true, errors);
  const description = parseText(value.description, `${path}.description`, true, errors);
  if (title.ja.trim() === "") errors.push(`${path}.title.ja is required.`);
  if (description.ja.trim() === "") errors.push(`${path}.description.ja is required.`);
  const type = value.type === "digital" ? "digital" : "in_person";
  if (value.type !== "digital" && value.type !== "in_person") {
    errors.push(`${path}.type must be digital or in_person.`);
  }
  const redemptionMethod =
    value.redemptionMethod === "staff_passcode" || value.redemptionMethod === "view_only"
      ? value.redemptionMethod
      : "manual_slide";
  if (
    value.redemptionMethod !== "manual_slide" &&
    value.redemptionMethod !== "staff_passcode" &&
    value.redemptionMethod !== "view_only"
  ) {
    errors.push(`${path}.redemptionMethod is invalid.`);
  }
  const requiredStampCount = finiteNumber(
    value.requiredStampCount,
    `${path}.requiredStampCount`,
    errors,
  );
  if (!Number.isInteger(requiredStampCount) || requiredStampCount < 0) {
    errors.push(`${path}.requiredStampCount must be a non-negative integer.`);
  }
  const staffPasscode = typeof value.staffPasscode === "string" ? value.staffPasscode : undefined;
  if (redemptionMethod === "staff_passcode" && !staffPasscode) {
    errors.push(`${path}.staffPasscode is required for staff_passcode redemption.`);
  }
  const digitalContentUrl =
    typeof value.digitalContentUrl === "string" && value.digitalContentUrl !== ""
      ? value.digitalContentUrl
      : undefined;
  return {
    id,
    title,
    description,
    type,
    redemptionMethod,
    requiredStampCount,
    ...(digitalContentUrl === undefined ? {} : { digitalContentUrl }),
    ...(staffPasscode === undefined ? {} : { staffPasscode }),
  };
}

export function parseRallyConfig(value: unknown): ConfigParseResult {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ["Config must be an object."] };
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (id === "") errors.push("id is required.");
  const title = parseText(value.title, "title", false, errors);
  if (title.ja.trim() === "") errors.push("title.ja is required.");
  const description = parseText(value.description, "description", false, errors);
  if (!Array.isArray(value.stamps)) errors.push("stamps must be an array.");
  if (value.rewards !== undefined && !Array.isArray(value.rewards)) {
    errors.push("rewards must be an array.");
  }
  const stamps = Array.isArray(value.stamps)
    ? value.stamps.map((spot, index) => parseSpot(spot, index, errors))
    : [];
  const rewards = Array.isArray(value.rewards)
    ? value.rewards.map((reward, index) => parseReward(reward, index, errors))
    : [];
  for (const [name, ids] of [
    ["stamp", stamps.map((stamp) => stamp.id)],
    ["reward", rewards.map((reward) => reward.id)],
  ] as const) {
    if (new Set(ids).size !== ids.length) errors.push(`${name} IDs must be unique.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      id,
      title,
      ...(description.ja === "" && description.en === "" ? {} : { description }),
      stamps,
      ...(rewards.length === 0 ? {} : { rewards }),
      ...(typeof value.isSequential === "boolean" ? { isSequential: value.isSequential } : {}),
    },
  };
}

export function parseRallyConfigJson(json: string): ConfigParseResult {
  try {
    return parseRallyConfig(JSON.parse(json) as unknown);
  } catch {
    return { ok: false, errors: ["JSON syntax is invalid."] };
  }
}

function normalizedOptionalText(text: LocalizedText | undefined): LocalizedString | undefined {
  if (text === undefined) return undefined;
  return toLocalizedString(text);
}

export function normalizeRallyConfig(config: RallyConfig): RallyConfig {
  const description = normalizedOptionalText(config.description);
  return {
    ...config,
    title: toLocalizedString(config.title),
    ...(description === undefined ? {} : { description }),
    stamps: config.stamps.map((spot) => {
      const spotDescription = normalizedOptionalText(spot.description);
      const hint = normalizedOptionalText(spot.hint);
      return {
        ...spot,
        name: toLocalizedString(spot.name),
        ...(spotDescription === undefined ? {} : { description: spotDescription }),
        ...(hint === undefined ? {} : { hint }),
      };
    }),
    ...(config.rewards === undefined
      ? {}
      : {
          rewards: config.rewards.map((reward) => ({
            ...reward,
            title: toLocalizedString(reward.title),
            description: toLocalizedString(reward.description),
          })),
        }),
  };
}

export function serializeRallyConfig(config: RallyConfig): string {
  return JSON.stringify(normalizeRallyConfig(config), null, 2);
}

export function loadStoredRallyConfig(key: string, fallback: RallyConfig): RallyConfig {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    if (stored === null || stored === undefined) return fallback;
    const result = parseRallyConfigJson(stored);
    return result.ok ? result.config : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredRallyConfig(key: string, config: RallyConfig): boolean {
  try {
    globalThis.localStorage?.setItem(key, serializeRallyConfig(config));
    return true;
  } catch {
    return false;
  }
}
