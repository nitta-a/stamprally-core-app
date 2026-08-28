import type {
  AdminRallyConfig,
  PublicRallyConfig,
  PublicSpotItem,
  Reward,
  SpotItem,
} from "./models.js";
import { toPublicConfig } from "./models.js";

/** Keys that must never cross the public configuration boundary. */
const PRIVATE_KEYS = new Set([
  "staffPasscode",
  "serverMetadata",
  "inventory",
  "secretToken",
  "secretParams",
  "digitalContentUrl",
  "code",
  "tagId",
]);

const SENSITIVE_KEY_PATTERN =
  /^(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|private[_-]?key|secret)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrivateKey(key: string): boolean {
  return PRIVATE_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key);
}

function sanitizeValue(
  value: unknown,
  customFilter: ((key: string, value: unknown) => boolean) | undefined,
  seen: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const items = value
      .map((item) => sanitizeValue(item, customFilter, seen))
      .filter((item): item is unknown => item !== undefined);
    return items;
  }
  if (!isRecord(value)) return value;
  if (seen.has(value)) return undefined;
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isPrivateKey(key) || customFilter?.(key, item) === false) continue;
    const sanitized = sanitizeValue(item, customFilter, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function sanitizeSpot<TLocale extends string, TMeta extends Record<string, unknown>>(
  spot: SpotItem<TLocale, TMeta>,
  customFilter: ((key: string, value: unknown) => boolean) | undefined,
): PublicSpotItem<TLocale, TMeta> {
  return sanitizeValue(
    toPublicConfig({
      id: "__spot__",
      version: "1",
      title: "__spot__",
      spots: [spot],
      rewards: [],
    }).spots[0],
    customFilter,
    new WeakSet<object>(),
  ) as PublicSpotItem<TLocale, TMeta>;
}

function sanitizeReward<TLocale extends string>(
  reward: Reward<TLocale>,
  customFilter: ((key: string, value: unknown) => boolean) | undefined,
): PublicRallyConfig<TLocale>["rewards"][number] {
  return sanitizeValue(
    toPublicConfig({
      id: "__reward__",
      version: "1",
      title: "__reward__",
      spots: [],
      rewards: [reward],
    }).rewards[0],
    customFilter,
    new WeakSet<object>(),
  ) as PublicRallyConfig<TLocale>["rewards"][number];
}

/**
 * Creates the client-facing configuration and removes private values at every
 * nesting level. `customFilter` is an allow-list predicate: returning false
 * removes that key.
 */
export function sanitizeAdminConfig<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>(
  admin: AdminRallyConfig<TLocale, TMeta>,
  customFilter?: (key: string, value: unknown) => boolean,
): PublicRallyConfig<TLocale, TMeta> {
  const publicConfig = toPublicConfig(admin);
  const sanitized = sanitizeValue(publicConfig, customFilter, new WeakSet<object>()) as Record<
    string,
    unknown
  >;
  sanitized.spots = admin.spots.map((spot) => sanitizeSpot(spot, customFilter));
  sanitized.rewards = admin.rewards.map((reward) => sanitizeReward(reward, customFilter));
  return sanitized as unknown as PublicRallyConfig<TLocale, TMeta>;
}

export interface PublicConfigSafety {
  readonly safe: boolean;
  readonly leakedKeys: string[];
}

/** Finds private keys, including keys nested in metadata or custom values. */
export function validatePublicConfigSafety(publicConfig: PublicRallyConfig): PublicConfigSafety {
  const leakedKeys: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, `${path}[${index}]`);
      });
      return;
    }
    if (!isRecord(value) || seen.has(value)) return;
    seen.add(value);
    for (const [key, item] of Object.entries(value)) {
      const nextPath = path === "$" ? key : `${path}.${key}`;
      if (isPrivateKey(key)) leakedKeys.push(nextPath);
      visit(item, nextPath);
    }
  };
  visit(publicConfig, "$");
  return { safe: leakedKeys.length === 0, leakedKeys };
}
