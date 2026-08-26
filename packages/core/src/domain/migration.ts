import type { StampCondition } from "./conditions.js";
import type { RallyConfig, RewardItem, SheetTheme, SpotItem, SupportedLocale } from "./models.js";
import { CURRENT_RALLY_CONFIG_VERSION } from "./validation.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | Partial<Record<string, string>> | undefined {
  if (typeof value === "string") return value;
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value).filter(([, item]) => typeof item === "string");
  return entries.length === 0
    ? undefined
    : (Object.fromEntries(entries) as Partial<Record<string, string>>);
}

function condition(value: unknown): StampCondition {
  if (!isObject(value) || typeof value.type !== "string") return { type: "instant" };
  switch (value.type) {
    case "instant":
      return { type: "instant" };
    case "token":
    case "passcode":
      return {
        type: "token",
        token:
          typeof value.token === "string"
            ? value.token
            : typeof value.passcode === "string"
              ? value.passcode
              : "",
      };
    case "geo":
      return {
        type: "geo",
        latitude: typeof value.latitude === "number" ? value.latitude : 0,
        longitude: typeof value.longitude === "number" ? value.longitude : 0,
        radiusMeters:
          typeof value.radiusMeters === "number"
            ? value.radiusMeters
            : typeof value.radius === "number"
              ? value.radius
              : 1,
      };
    case "composite":
      return {
        type: "composite",
        operator: value.operator === "OR" ? "OR" : "AND",
        conditions: Array.isArray(value.conditions) ? value.conditions.map(condition) : [],
      };
    case "time_window":
      return {
        type: "time_window",
        startsAt: typeof value.startsAt === "string" ? value.startsAt : "1970-01-01T00:00:00.000Z",
        endsAt: typeof value.endsAt === "string" ? value.endsAt : "9999-12-31T23:59:59.999Z",
        condition: condition(value.condition),
      };
    default:
      return { type: "instant" };
  }
}

function migrateSpot(value: unknown, index: number): SpotItem {
  const source = isObject(value) ? value : {};
  const id =
    typeof source.id === "string" && source.id.trim() !== ""
      ? source.id.trim()
      : `spot-${index + 1}`;
  const description = text(source.description);
  const hint = text(source.hint);
  return {
    id,
    name: text(source.name) ?? `Spot ${index + 1}`,
    ...(description === undefined ? {} : { description }),
    ...(hint === undefined ? {} : { hint }),
    condition: condition(
      source.condition ??
        (typeof source.token === "string" ? { type: "token", token: source.token } : undefined),
    ),
    ...(typeof source.orderIndex === "number"
      ? { orderIndex: source.orderIndex }
      : typeof source.order === "number"
        ? { order: source.order }
        : {}),
    ...(typeof source.deckId === "string" ? { deckId: source.deckId } : {}),
    ...(typeof source.groupId === "string" ? { groupId: source.groupId } : {}),
    ...(typeof source.guideId === "string" ? { guideId: source.guideId } : {}),
    ...(typeof source.iconUrl === "string" ? { iconUrl: source.iconUrl } : {}),
    ...(typeof source.imageUrl === "string" ? { imageUrl: source.imageUrl } : {}),
    ...(typeof source.externalUrl === "string" ? { externalUrl: source.externalUrl } : {}),
    ...(typeof source.redirectUrlAfterClaim === "string"
      ? { redirectUrlAfterClaim: source.redirectUrlAfterClaim }
      : {}),
    ...(isObject(source.metadata) ? { metadata: source.metadata } : {}),
    ...(Array.isArray(source.dependsOn)
      ? { dependsOn: source.dependsOn.filter((item): item is string => typeof item === "string") }
      : {}),
  };
}

function migrateReward(value: unknown, index: number): RewardItem {
  const source = isObject(value) ? value : {};
  return {
    id:
      typeof source.id === "string" && source.id.trim() !== ""
        ? source.id.trim()
        : `reward-${index + 1}`,
    title: text(source.title) ?? `Reward ${index + 1}`,
    description: text(source.description) ?? "",
    type: source.type === "digital" ? "digital" : "in_person",
    redemptionMethod:
      source.redemptionMethod === "staff_passcode" ||
      source.redemptionMethod === "view_only" ||
      source.redemptionMethod === "server_claim"
        ? source.redemptionMethod
        : "manual_slide",
    requiredStampCount:
      typeof source.requiredStampCount === "number" && Number.isFinite(source.requiredStampCount)
        ? Math.max(0, Math.trunc(source.requiredStampCount))
        : 0,
    ...(typeof source.digitalContentUrl === "string"
      ? { digitalContentUrl: source.digitalContentUrl }
      : {}),
    ...(typeof source.staffPasscode === "string" ? { staffPasscode: source.staffPasscode } : {}),
    ...(typeof source.validUntil === "string" ? { validUntil: source.validUntil } : {}),
    ...(typeof source.maxStock === "number" ? { maxStock: source.maxStock } : {}),
    ...(typeof source.limitPerUser === "number" ? { limitPerUser: source.limitPerUser } : {}),
    ...(typeof source.stockLimit === "number" ? { stockLimit: source.stockLimit } : {}),
    ...(typeof source.userClaimLimit === "number" ? { userClaimLimit: source.userClaimLimit } : {}),
    ...(typeof source.claimTicketNumber === "string"
      ? { claimTicketNumber: source.claimTicketNumber }
      : {}),
  };
}

export function migrateRallyConfig<TLocale extends string = SupportedLocale>(
  raw: unknown,
): RallyConfig<TLocale> {
  const source = isObject(raw) ? raw : {};
  const rawStamps = Array.isArray(source.stamps)
    ? source.stamps
    : Array.isArray(source.spots)
      ? source.spots
      : [];
  const rawRewards = Array.isArray(source.rewards) ? source.rewards : [];
  const id =
    typeof source.id === "string" && source.id.trim() !== "" ? source.id.trim() : "migrated-rally";
  const title = text(source.title);
  const description = text(source.description);
  const theme = isObject(source.theme) ? source.theme : undefined;
  return {
    id,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    stamps: rawStamps.map(migrateSpot),
    ...(rawRewards.length === 0 ? {} : { rewards: rawRewards.map(migrateReward) }),
    ...(typeof source.isSequential === "boolean" ? { isSequential: source.isSequential } : {}),
    ...(theme === undefined ? {} : { theme: theme as unknown as SheetTheme }),
    version: CURRENT_RALLY_CONFIG_VERSION,
    ...(typeof source.startDate === "string"
      ? { startDate: source.startDate }
      : typeof source.startsAt === "string"
        ? { startDate: source.startsAt }
        : {}),
    ...(typeof source.endDate === "string"
      ? { endDate: source.endDate }
      : typeof source.endsAt === "string"
        ? { endDate: source.endsAt }
        : {}),
  } as RallyConfig<TLocale>;
}
