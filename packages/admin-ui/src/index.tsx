import type {
  AdminRallyConfig,
  CheckInCondition,
  ExternalReference,
  LocaleDictionary,
  LocalizedText,
  Reward,
  RewardUnlockCondition,
  SheetTheme,
  SpotItem,
  SupportedLocale,
} from "@stamprally/core";
import {
  DEFAULT_SHEET_THEME,
  resolveLocalizedText,
  safeParseAdminConfig,
  updateLocalizedField,
} from "@stamprally/core";
import {
  type Dispatch,
  type ReactElement,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface AdminRallyEditorProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onChange: (config: AdminRallyConfig<TLocale, TMeta>) => void;
  readonly locale?: string;
  readonly dictionary?: LocaleDictionary<TLocale>;
}

export interface UseAdminRallyEditorOptions<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly onChange?: (config: AdminRallyConfig<TLocale, TMeta>) => void;
}
export interface UseAdminRallyEditorReturn<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly setConfig: Dispatch<SetStateAction<AdminRallyConfig<TLocale, TMeta>>>;
  readonly update: (patch: Partial<AdminRallyConfig<TLocale, TMeta>>) => void;
  readonly updateSpot: (spotId: string, patch: Partial<SpotItem<TLocale, TMeta>>) => void;
  readonly updateReward: (rewardId: string, patch: Partial<Reward<TLocale>>) => void;
  readonly addSpot: (spotData?: Partial<SpotItem<TLocale, TMeta>>) => void;
  readonly removeSpot: (spotId: string) => void;
  readonly reorderSpots: (fromIndex: number, toIndex: number) => void;
  readonly reorderRewards: (fromIndex: number, toIndex: number) => void;
  readonly duplicateSpot: (spotId: string) => void;
  readonly addReward: (rewardData?: Partial<Reward<TLocale>>) => void;
  readonly removeReward: (rewardId: string) => void;
  readonly duplicateReward: (rewardId: string) => void;
  readonly addCondition: (spotId: string, nextCondition: CheckInCondition) => void;
  readonly removeCondition: (spotId: string, conditionIndex: number) => void;
  readonly updateLocalizedField: (path: string, locale: TLocale, value: string) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly resetConfig: (newConfig: AdminRallyConfig<TLocale, TMeta>) => void;
  readonly reset: () => void;
  readonly isDirty: boolean;
}

type EditorHistory<T> = {
  readonly past: ReadonlyArray<T>;
  readonly present: T;
  readonly future: ReadonlyArray<T>;
};

function nextEntityId(prefix: string, ids: ReadonlySet<string>): string {
  let index = ids.size + 1;
  let candidate = `${prefix}-${index}`;
  while (ids.has(candidate)) {
    index += 1;
    candidate = `${prefix}-${index}`;
  }
  return candidate;
}

function pathParts(path: string): string[] {
  return path
    .replaceAll("[", ".")
    .replaceAll("]", "")
    .split(".")
    .filter((part) => part !== "");
}

function localizedValue<TLocale extends string>(
  value: unknown,
  locale: TLocale,
  nextValue: string,
): LocalizedText<TLocale> {
  return updateLocalizedField(
    typeof value === "string" || (typeof value === "object" && value !== null)
      ? (value as LocalizedText<TLocale>)
      : "",
    locale,
    nextValue,
  );
}

/** Headless state and immutable update helpers for CMS integrations. */
export function useAdminRallyEditor<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>(
  initialConfig: AdminRallyConfig<TLocale, TMeta>,
  options: UseAdminRallyEditorOptions<TLocale, TMeta> = {},
): UseAdminRallyEditorReturn<TLocale, TMeta> {
  const initialRef = useRef(initialConfig);
  const previousInitialRef = useRef(initialConfig);
  const [history, setHistory] = useState<EditorHistory<AdminRallyConfig<TLocale, TMeta>>>({
    past: [],
    present: initialConfig,
    future: [],
  });
  const config = history.present;
  useEffect(() => {
    if (previousInitialRef.current === initialConfig) return;
    previousInitialRef.current = initialConfig;
    const isDirty = JSON.stringify(history.present) !== JSON.stringify(initialRef.current);
    if (!isDirty) {
      initialRef.current = initialConfig;
      setHistory({ past: [], present: initialConfig, future: [] });
    }
  }, [history.present, initialConfig]);
  const commit = useCallback(
    (value: SetStateAction<AdminRallyConfig<TLocale, TMeta>>): void => {
      setHistory((current) => {
        const next = typeof value === "function" ? value(current.present) : value;
        if (next === current.present) return current;
        options.onChange?.(next);
        return { past: [...current.past, current.present], present: next, future: [] };
      });
    },
    [options.onChange],
  );
  const setConfig: Dispatch<SetStateAction<AdminRallyConfig<TLocale, TMeta>>> = commit;
  const update = (patch: Partial<AdminRallyConfig<TLocale, TMeta>>): void =>
    commit((current) => ({ ...current, ...patch }));
  const updateSpot = (spotId: string, patch: Partial<SpotItem<TLocale, TMeta>>): void =>
    commit((current) => ({
      ...current,
      spots: current.spots.map((spot) => (spot.id === spotId ? { ...spot, ...patch } : spot)),
    }));
  const updateReward = (rewardId: string, patch: Partial<Reward<TLocale>>): void =>
    commit((current) => ({
      ...current,
      rewards: current.rewards.map((reward) =>
        reward.id === rewardId ? { ...reward, ...patch } : reward,
      ),
    }));
  const addSpot = (spotData: Partial<SpotItem<TLocale, TMeta>> = {}): void =>
    commit((current) => {
      const id = spotData.id ?? nextEntityId("spot", new Set(current.spots.map((spot) => spot.id)));
      const base = newSpot<TLocale, TMeta>(current.spots.length);
      return {
        ...current,
        spots: [...current.spots, { ...base, ...spotData, id, orderIndex: current.spots.length }],
      };
    });
  const removeSpot = (spotId: string): void =>
    commit((current) => ({
      ...current,
      spots: current.spots
        .filter((spot) => spot.id !== spotId)
        .map((spot, index) => ({ ...spot, orderIndex: index })),
    }));
  const reorderSpots = (fromIndex: number, toIndex: number): void =>
    commit((current) => ({ ...current, spots: moveTo(current.spots, fromIndex, toIndex) }));
  const reorderRewards = (fromIndex: number, toIndex: number): void =>
    commit((current) => ({ ...current, rewards: moveTo(current.rewards, fromIndex, toIndex) }));
  const duplicateSpot = (spotId: string): void =>
    commit((current) => {
      const source = current.spots.find((spot) => spot.id === spotId);
      if (source === undefined) return current;
      const id = nextEntityId("spot-copy", new Set(current.spots.map((spot) => spot.id)));
      const copy = { ...structuredClone(source), id, orderIndex: current.spots.length };
      return { ...current, spots: [...current.spots, copy] };
    });
  const addReward = (rewardData: Partial<Reward<TLocale>> = {}): void =>
    commit((current) => {
      const id =
        rewardData.id ?? nextEntityId("reward", new Set(current.rewards.map((item) => item.id)));
      return {
        ...current,
        rewards: [...current.rewards, { ...newReward(current.rewards.length), ...rewardData, id }],
      };
    });
  const removeReward = (rewardId: string): void =>
    commit((current) => ({
      ...current,
      rewards: current.rewards.filter((item) => item.id !== rewardId),
    }));
  const duplicateReward = (rewardId: string): void =>
    commit((current) => {
      const source = current.rewards.find((reward) => reward.id === rewardId);
      if (source === undefined) return current;
      const id = nextEntityId("reward-copy", new Set(current.rewards.map((item) => item.id)));
      return { ...current, rewards: [...current.rewards, { ...structuredClone(source), id }] };
    });
  const addCondition = (spotId: string, nextCondition: CheckInCondition): void =>
    commit((current) => ({
      ...current,
      spots: current.spots.map((spot) =>
        spot.id !== spotId
          ? spot
          : { ...spot, conditions: [...spot.conditions, structuredClone(nextCondition)] },
      ),
    }));
  const removeCondition = (spotId: string, conditionIndex: number): void =>
    commit((current) => ({
      ...current,
      spots: current.spots.map((spot) =>
        spot.id !== spotId
          ? spot
          : { ...spot, conditions: spot.conditions.filter((_, index) => index !== conditionIndex) },
      ),
    }));
  const updateLocalized = (path: string, locale: TLocale, value: string): void =>
    commit((current) => {
      const parts = pathParts(path);
      if (parts[0] === "spots" && parts.length >= 3) {
        const requestedIndex = parts[1];
        const index =
          requestedIndex !== undefined && /^\d+$/.test(requestedIndex)
            ? Number(requestedIndex)
            : current.spots.findIndex((spot) => spot.id === requestedIndex);
        const field = parts[2];
        if (index < 0 || field === undefined || current.spots[index] === undefined) return current;
        return {
          ...current,
          spots: current.spots.map((spot, spotIndex) =>
            spotIndex === index
              ? {
                  ...spot,
                  [field]: localizedValue(spot[field as keyof typeof spot], locale, value),
                }
              : spot,
          ),
        };
      }
      if (parts[0] === "rewards" && parts.length >= 3) {
        const requestedIndex = parts[1];
        const index =
          requestedIndex !== undefined && /^\d+$/.test(requestedIndex)
            ? Number(requestedIndex)
            : current.rewards.findIndex((reward) => reward.id === requestedIndex);
        const field = parts[2];
        if (index < 0 || field === undefined || current.rewards[index] === undefined)
          return current;
        return {
          ...current,
          rewards: current.rewards.map((reward, rewardIndex) =>
            rewardIndex === index
              ? {
                  ...reward,
                  [field]: localizedValue(reward[field as keyof typeof reward], locale, value),
                }
              : reward,
          ),
        };
      }
      const field = parts[0];
      if (field === undefined) return current;
      return {
        ...current,
        [field]: localizedValue(current[field as keyof typeof current], locale, value),
      };
    });
  const undo = (): void =>
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (previous === undefined) return current;
      options.onChange?.(previous);
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  const redo = (): void =>
    setHistory((current) => {
      const next = current.future[0];
      if (next === undefined) return current;
      options.onChange?.(next);
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  const resetConfig = (newConfig: AdminRallyConfig<TLocale, TMeta>): void => {
    initialRef.current = newConfig;
    previousInitialRef.current = newConfig;
    setHistory({ past: [], present: newConfig, future: [] });
    options.onChange?.(newConfig);
  };
  return {
    config,
    setConfig,
    update,
    updateSpot,
    updateReward,
    addSpot,
    removeSpot,
    reorderSpots: (fromIndex, toIndex) => reorderSpots(fromIndex, toIndex),
    reorderRewards,
    duplicateSpot,
    addReward,
    removeReward,
    duplicateReward,
    addCondition,
    removeCondition,
    updateLocalizedField: updateLocalized,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    resetConfig,
    reset: () => resetConfig(initialRef.current),
    isDirty: config !== initialRef.current,
  };
}

export interface EntityEditorOptions<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> extends UseAdminRallyEditorOptions<TLocale, TMeta> {
  readonly config?: AdminRallyConfig<TLocale, TMeta>;
  readonly initialConfig?: AdminRallyConfig<TLocale, TMeta>;
}
export interface SpotEditorReturn<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta> | undefined;
  readonly spot: SpotItem<TLocale, TMeta> | undefined;
  readonly setConfig: Dispatch<SetStateAction<AdminRallyConfig<TLocale, TMeta> | undefined>>;
  readonly update: (patch: Partial<SpotItem<TLocale, TMeta>>) => void;
  readonly remove: () => void;
}

export function useSpotEditor<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>(
  spotId: string,
  options: EntityEditorOptions<TLocale, TMeta> = {},
): SpotEditorReturn<TLocale, TMeta> {
  const [config, setConfig] = useState<AdminRallyConfig<TLocale, TMeta> | undefined>(
    options.config ?? options.initialConfig,
  );
  const commit = (
    updateConfig: (current: AdminRallyConfig<TLocale, TMeta>) => AdminRallyConfig<TLocale, TMeta>,
  ): void => {
    setConfig((current) => {
      if (current === undefined) return current;
      const next = updateConfig(current);
      options.onChange?.(next);
      return next;
    });
  };
  const spot = config?.spots.find((item) => item.id === spotId);
  return {
    config,
    spot,
    setConfig,
    update: (patch) => {
      if (config === undefined || spot === undefined) return;
      commit((current) => ({
        ...current,
        spots: current.spots.map((item) => (item.id === spotId ? { ...item, ...patch } : item)),
      }));
    },
    remove: () => {
      if (config === undefined || spot === undefined) return;
      commit((current) => ({
        ...current,
        spots: current.spots.filter((item) => item.id !== spotId),
      }));
    },
  };
}

export function useRewardEditor<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>(
  rewardId: string,
  options: EntityEditorOptions<TLocale, TMeta> = {},
): {
  readonly config: AdminRallyConfig<TLocale, TMeta> | undefined;
  readonly reward: Reward<TLocale> | undefined;
  readonly setConfig: Dispatch<SetStateAction<AdminRallyConfig<TLocale, TMeta> | undefined>>;
  readonly update: (patch: Partial<Reward<TLocale>>) => void;
  readonly remove: () => void;
} {
  const [config, setConfig] = useState<AdminRallyConfig<TLocale, TMeta> | undefined>(
    options.config ?? options.initialConfig,
  );
  const reward = config?.rewards.find((item) => item.id === rewardId);
  const commit = (
    updateConfig: (current: AdminRallyConfig<TLocale, TMeta>) => AdminRallyConfig<TLocale, TMeta>,
  ): void => {
    setConfig((current) => {
      if (current === undefined) return current;
      const next = updateConfig(current);
      options.onChange?.(next);
      return next;
    });
  };
  return {
    config,
    reward,
    setConfig,
    update: (patch) => {
      if (config === undefined || reward === undefined) return;
      commit((current) => ({
        ...current,
        rewards: current.rewards.map((item) =>
          item.id === rewardId ? { ...item, ...patch } : item,
        ),
      }));
    },
    remove: () => {
      if (config === undefined || reward === undefined) return;
      commit((current) => ({
        ...current,
        rewards: current.rewards.filter((item) => item.id !== rewardId),
      }));
    },
  };
}

type DictionaryProps<TLocale extends string> = {
  readonly locale?: NoInfer<TLocale>;
  readonly dictionary?: LocaleDictionary<TLocale>;
};

function text<TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string {
  return dictionary?.[locale]?.[key] ?? fallback;
}

const condition = (): CheckInCondition => ({ type: "passcode", code: "" });
const newSpot = <TLocale extends string, TMeta extends Record<string, unknown>>(
  index: number,
): SpotItem<TLocale, TMeta> => ({
  id: `spot-${index + 1}`,
  orderIndex: index,
  name: `Spot ${index + 1}`,
  conditions: [condition()],
});
const newReward = (index: number): Reward => ({
  id: `reward-${index + 1}`,
  title: `Reward ${index + 1}`,
  type: "digital",
  redemptionMethod: "server_claim",
  requiredStampCount: index + 1,
});

function move<T>(items: ReadonlyArray<T>, index: number, direction: -1 | 1): ReadonlyArray<T> {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
}

function moveTo<T>(items: ReadonlyArray<T>, fromIndex: number, toIndex: number): ReadonlyArray<T> {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  )
    return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (item !== undefined) next.splice(toIndex, 0, item);
  return next.map((entry, index) =>
    typeof entry === "object" && entry !== null && "orderIndex" in entry
      ? ({ ...entry, orderIndex: index } as T)
      : entry,
  );
}

export interface ConditionEditorProps<TLocale extends string = SupportedLocale>
  extends DictionaryProps<TLocale> {
  readonly condition: CheckInCondition;
  readonly onChange: (condition: CheckInCondition) => void;
  readonly onRemove?: () => void;
}

export function ConditionEditor<TLocale extends string = SupportedLocale>({
  condition,
  onChange,
  onRemove,
  locale,
  dictionary,
}: ConditionEditorProps<TLocale>): ReactElement {
  const activeLocale = locale ?? ("en" as TLocale);
  const field = (key: string, fallback: string): string =>
    text(dictionary, activeLocale, key, fallback);
  return (
    <fieldset>
      <legend>{field("condition", "Condition")}</legend>
      <label>
        {field("conditionType", "Type")}
        <select
          value={condition.type}
          onChange={(event) => {
            const type = event.target.value as CheckInCondition["type"];
            onChange(
              type === "qr"
                ? { type, secretToken: "" }
                : type === "passcode"
                  ? { type, code: "", caseSensitive: false }
                  : type === "gps"
                    ? { type, latitude: 0, longitude: 0, radiusMeters: 100 }
                    : type === "nfc"
                      ? { type, tagId: "" }
                      : { type, validatorName: "" },
            );
          }}
        >
          {(["qr", "passcode", "gps", "nfc", "custom"] as const).map((type) => (
            <option key={type} value={type}>
              {field(`condition.${type}`, type.toUpperCase())}
            </option>
          ))}
        </select>
      </label>
      {condition.type === "qr" && (
        <>
          <label>
            {field("secretToken", "QR token")}
            <input
              value={condition.secretToken}
              onChange={(event) => onChange({ ...condition, secretToken: event.target.value })}
            />
          </label>
          <label>
            {field("qrEntryUrl", "QR entry URL")}
            <input
              value={condition.qrEntryUrl ?? ""}
              onChange={(event) => onChange({ ...condition, qrEntryUrl: event.target.value })}
            />
          </label>
        </>
      )}
      {condition.type === "passcode" && (
        <>
          <label>
            {field("passcode", "Passcode")}
            <input
              value={condition.code}
              onChange={(event) => onChange({ ...condition, code: event.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={condition.caseSensitive ?? false}
              onChange={(event) => onChange({ ...condition, caseSensitive: event.target.checked })}
            />
            {field("caseSensitive", "Case sensitive")}
          </label>
        </>
      )}
      {condition.type === "gps" && (
        <div>
          {(["latitude", "longitude", "radiusMeters"] as const).map((key) => (
            <label key={key}>
              {field(key, key)}
              <input
                type="number"
                value={condition[key]}
                onChange={(event) => onChange({ ...condition, [key]: Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
      )}
      {condition.type === "nfc" && (
        <label>
          {field("tagId", "NFC tag ID")}
          <input
            value={condition.tagId}
            onChange={(event) => onChange({ ...condition, tagId: event.target.value })}
          />
        </label>
      )}
      {condition.type === "custom" && (
        <label>
          {field("validatorName", "Validator name")}
          <input
            value={condition.validatorName}
            onChange={(event) => onChange({ ...condition, validatorName: event.target.value })}
          />
        </label>
      )}
      {onRemove !== undefined && (
        <button type="button" onClick={onRemove}>
          {field("removeCondition", "Remove condition")}
        </button>
      )}
    </fieldset>
  );
}

export interface SpotItemFormProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> extends DictionaryProps<TLocale> {
  readonly spot: SpotItem<TLocale, TMeta>;
  readonly onChange: (spot: SpotItem<TLocale, TMeta>) => void;
  readonly onRemove?: () => void;
}

export function SpotItemForm<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  spot,
  onChange,
  onRemove,
  locale,
  dictionary,
}: SpotItemFormProps<TLocale, TMeta>): ReactElement {
  const activeLocale = locale ?? ("en" as TLocale);
  const field = (key: string, fallback: string): string =>
    text(dictionary, activeLocale, key, fallback);
  const update = (patch: Partial<SpotItem<TLocale, TMeta>>): void =>
    onChange({ ...spot, ...patch });
  return (
    <fieldset>
      <legend>{resolveLocalizedText(spot.name, activeLocale)}</legend>
      <label>
        {field("spotName", "Spot name")}
        <input
          value={resolveLocalizedText(spot.name, activeLocale)}
          onChange={(event) =>
            update({ name: updateLocalizedField(spot.name, activeLocale, event.target.value) })
          }
        />
      </label>
      {(["description", "hint"] as const).map((key) => (
        <label key={key}>
          {field(key, key)}
          <textarea
            value={resolveLocalizedText(spot[key] ?? "", activeLocale)}
            onChange={(event) =>
              update({
                [key]: updateLocalizedField(spot[key] ?? "", activeLocale, event.target.value),
              })
            }
          />
        </label>
      ))}
      {(["imageUrl", "iconUrl", "redirectUrlAfterClaim"] as const).map((key) => (
        <label key={key}>
          {field(key, key)}
          <input
            value={spot[key] ?? ""}
            onChange={(event) => update({ [key]: event.target.value })}
          />
        </label>
      ))}
      <label>
        {field("prerequisites", "Prerequisite spots")}
        <input
          value={spot.prerequisites?.join(", ") ?? ""}
          onChange={(event) =>
            update({
              prerequisites: event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <ExternalReferencesEditor
        references={spot.externalReferences ?? []}
        onChange={(externalReferences) => update({ externalReferences })}
        label={field("externalReferences", "External references")}
      />
      <MetadataSection
        name={`spot-${spot.id}`}
        values={spot.metadata ?? {}}
        onChange={(metadata) => update({ metadata: metadata as TMeta })}
        label={field("metadata", "Metadata")}
      />
      {spot.conditions.map((item, index) => (
        <ConditionEditor
          key={`${spot.id}-condition-${JSON.stringify(item)}`}
          condition={item}
          locale={activeLocale}
          {...(dictionary === undefined ? {} : { dictionary })}
          onChange={(next) =>
            update({
              conditions: spot.conditions.map((current, itemIndex) =>
                itemIndex === index ? next : current,
              ),
            })
          }
          {...(spot.conditions.length <= 1
            ? {}
            : {
                onRemove: () =>
                  update({
                    conditions: spot.conditions.filter((_, itemIndex) => itemIndex !== index),
                  }),
              })}
        />
      ))}
      <button
        type="button"
        onClick={() => update({ conditions: [...spot.conditions, condition()] })}
      >
        {field("addCondition", "Add condition")}
      </button>
      {onRemove !== undefined && (
        <button type="button" onClick={onRemove}>
          {field("removeSpot", "Remove spot")}
        </button>
      )}
    </fieldset>
  );
}

export interface RewardItemFormProps<TLocale extends string = SupportedLocale>
  extends DictionaryProps<TLocale> {
  readonly reward: Reward<TLocale>;
  readonly onChange: (reward: Reward<TLocale>) => void;
  readonly onRemove: () => void;
}

function newUnlockCondition(type: RewardUnlockCondition["type"]): RewardUnlockCondition {
  if (type === "stamp_count") return { type, count: 1 };
  if (type === "stamps") return { type, stampIds: [] };
  return { type, conditions: [] };
}

export interface RewardUnlockConditionEditorProps extends DictionaryProps<SupportedLocale> {
  readonly condition: RewardUnlockCondition;
  readonly onChange: (condition: RewardUnlockCondition) => void;
  readonly onRemove?: () => void;
}

export function RewardUnlockConditionEditor({
  condition: unlock,
  onChange,
  onRemove,
}: RewardUnlockConditionEditorProps): ReactElement {
  return (
    <fieldset>
      <legend>Unlock condition</legend>
      <label>
        Type
        <select
          value={unlock.type}
          onChange={(event) =>
            onChange(newUnlockCondition(event.target.value as RewardUnlockCondition["type"]))
          }
        >
          <option value="stamp_count">Stamp count</option>
          <option value="stamps">Specific stamps</option>
          <option value="all">All conditions</option>
          <option value="any">Any condition</option>
        </select>
      </label>
      {unlock.type === "stamp_count" && (
        <label>
          Count
          <input
            type="number"
            min={0}
            value={unlock.count}
            onChange={(event) => onChange({ ...unlock, count: Number(event.target.value) })}
          />
        </label>
      )}
      {unlock.type === "stamps" && (
        <label>
          Stamp IDs
          <input
            value={unlock.stampIds.join(", ")}
            onChange={(event) =>
              onChange({
                ...unlock,
                stampIds: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      )}
      {(unlock.type === "all" || unlock.type === "any") && (
        <>
          {unlock.conditions.map((child, index) => (
            <RewardUnlockConditionEditor
              key={`${unlock.type}-${JSON.stringify(child)}`}
              condition={child}
              onChange={(next) =>
                onChange({
                  ...unlock,
                  conditions: unlock.conditions.map((current, childIndex) =>
                    childIndex === index ? next : current,
                  ),
                })
              }
              onRemove={() =>
                onChange({
                  ...unlock,
                  conditions: unlock.conditions.filter((_, childIndex) => childIndex !== index),
                })
              }
            />
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...unlock,
                conditions: [...unlock.conditions, newUnlockCondition("stamp_count")],
              })
            }
          >
            Add nested condition
          </button>
        </>
      )}
      {onRemove !== undefined && (
        <button type="button" onClick={onRemove}>
          Remove condition
        </button>
      )}
    </fieldset>
  );
}

export function RewardItemForm<TLocale extends string = SupportedLocale>({
  reward,
  locale,
  dictionary,
  onChange,
  onRemove,
}: RewardItemFormProps<TLocale> & { readonly locale: TLocale }): ReactElement {
  const field = (key: string, fallback: string): string => text(dictionary, locale, key, fallback);
  return (
    <fieldset>
      <legend>{resolveLocalizedText(reward.title, locale)}</legend>
      <label>
        {field("rewardTitle", "Reward title")}
        <input
          value={resolveLocalizedText(reward.title, locale)}
          onChange={(event) =>
            onChange({
              ...reward,
              title: updateLocalizedField(reward.title, locale, event.target.value),
            })
          }
        />
      </label>
      <label>
        {field("description", "Description")}
        <textarea
          value={resolveLocalizedText(reward.description ?? "", locale)}
          onChange={(event) =>
            onChange({
              ...reward,
              description: updateLocalizedField(
                reward.description ?? "",
                locale,
                event.target.value,
              ),
            })
          }
        />
      </label>
      <label>
        {field("requiredSpotCount", "Required spot count")}
        <input
          type="number"
          min={0}
          value={reward.requiredStampCount}
          onChange={(event) =>
            onChange({ ...reward, requiredStampCount: Number(event.target.value) })
          }
        />
      </label>
      <label>
        {field("rewardType", "Reward type")}
        <select
          value={reward.type}
          onChange={(event) => onChange({ ...reward, type: event.target.value as Reward["type"] })}
        >
          <option value="digital">{field("rewardType.digital", "Digital")}</option>
          <option value="in_person">{field("rewardType.inPerson", "In person")}</option>
        </select>
      </label>
      <label>
        {field("redemptionMethod", "Redemption method")}
        <select
          value={reward.redemptionMethod}
          onChange={(event) =>
            onChange({
              ...reward,
              redemptionMethod: event.target.value as Reward["redemptionMethod"],
            })
          }
        >
          <option value="server_claim">{field("redemption.serverClaim", "Server claim")}</option>
          <option value="manual_slide">{field("redemption.manualSlide", "Manual slide")}</option>
          <option value="staff_passcode">
            {field("redemption.staffPasscode", "Staff passcode")}
          </option>
          <option value="view_only">{field("redemption.viewOnly", "View only")}</option>
        </select>
      </label>
      <fieldset>
        <legend>{field("unlockConditions", "Unlock conditions")}</legend>
        {(reward.conditions ?? []).map((unlock, index) => (
          <RewardUnlockConditionEditor
            key={`${reward.id}-unlock-${JSON.stringify(unlock)}`}
            condition={unlock}
            onChange={(next) =>
              onChange({
                ...reward,
                conditions: (reward.conditions ?? []).map((current, conditionIndex) =>
                  conditionIndex === index ? next : current,
                ),
              })
            }
            onRemove={() =>
              onChange({
                ...reward,
                conditions: (reward.conditions ?? []).filter(
                  (_, conditionIndex) => conditionIndex !== index,
                ),
              })
            }
          />
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...reward,
              conditions: [...(reward.conditions ?? []), newUnlockCondition("stamp_count")],
            })
          }
        >
          {field("addUnlockCondition", "Add unlock condition")}
        </button>
      </fieldset>
      {(["stockLimit", "userClaimLimit"] as const).map((key) => (
        <label key={key}>
          {field(key, key)}
          <input
            type="number"
            min={0}
            value={reward[key] ?? ""}
            onChange={(event) => {
              if (event.target.value === "") {
                const { [key]: _removed, ...withoutLimit } = reward;
                onChange(withoutLimit);
              } else onChange({ ...reward, [key]: Number(event.target.value) });
            }}
          />
        </label>
      ))}
      <label>
        {field("digitalContentUrl", "Digital content URL")}
        <input
          value={reward.digitalContentUrl ?? ""}
          onChange={(event) => onChange({ ...reward, digitalContentUrl: event.target.value })}
        />
      </label>
      <label>
        {field("staffPasscode", "Staff passcode")}
        <input
          value={reward.staffPasscode ?? ""}
          onChange={(event) => onChange({ ...reward, staffPasscode: event.target.value })}
        />
      </label>
      <label>
        {field("validUntil", "Valid until")}
        <input
          type="datetime-local"
          value={reward.validUntil?.slice(0, 16) ?? ""}
          onChange={(event) => {
            if (event.target.value === "") {
              const { validUntil: _removed, ...withoutDate } = reward;
              onChange(withoutDate);
            } else onChange({ ...reward, validUntil: new Date(event.target.value).toISOString() });
          }}
        />
      </label>
      <button type="button" onClick={onRemove}>
        {field("removeReward", "Remove reward")}
      </button>
    </fieldset>
  );
}

export interface ThemeEditorProps<TLocale extends string = SupportedLocale>
  extends DictionaryProps<TLocale> {
  readonly theme: SheetTheme;
  readonly onChange: (theme: SheetTheme) => void;
}

export function ThemeEditor<TLocale extends string = SupportedLocale>({
  theme,
  onChange,
  locale,
  dictionary,
}: ThemeEditorProps<TLocale>): ReactElement {
  const activeLocale = locale ?? ("en" as TLocale);
  const field = (key: string, fallback: string): string =>
    text(dictionary, activeLocale, key, fallback);
  const update = <K extends keyof SheetTheme>(key: K, value: SheetTheme[K]): void =>
    onChange({ ...theme, [key]: value });
  return (
    <fieldset>
      <legend>{field("theme", "Theme")}</legend>
      {(
        [
          "primaryColor",
          "backgroundColor",
          "cardBackgroundColor",
          "textColor",
          "backgroundImageUrl",
          "completedStampColor",
        ] as const
      ).map((key) => (
        <label key={key}>
          {field(key, key)}
          <input
            type={key.toLowerCase().includes("color") ? "color" : "url"}
            value={theme[key] ?? ""}
            onChange={(event) => update(key, event.target.value)}
          />
        </label>
      ))}
      <label>
        {field("slotShape", "Slot shape")}
        <select
          value={theme.slotShape}
          onChange={(event) => update("slotShape", event.target.value as SheetTheme["slotShape"])}
        >
          {(["circle", "square", "rounded"] as const).map((shape) => (
            <option key={shape} value={shape}>
              {field(`slotShape.${shape}`, shape)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {field("gridColumns", "Grid columns")}
        <input
          type="number"
          min={1}
          max={12}
          value={theme.gridColumns}
          onChange={(event) => update("gridColumns", Number(event.target.value))}
        />
      </label>
      <label>
        {field("fontFamily", "Font family")}
        <select
          value={theme.fontFamily ?? "system-ui"}
          onChange={(event) => update("fontFamily", event.target.value as SheetTheme["fontFamily"])}
        >
          {(["system-ui", "serif", "rounded-sans", "monospace", "handwritten"] as const).map(
            (font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        {field("unclaimedOpacity", "Unclaimed opacity")}
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={theme.unclaimedOpacity ?? 1}
          onChange={(event) => update("unclaimedOpacity", Number(event.target.value))}
        />
      </label>
    </fieldset>
  );
}

function metadataValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export interface ExternalReferencesEditorProps {
  readonly references: ReadonlyArray<ExternalReference>;
  readonly onChange: (references: ReadonlyArray<ExternalReference>) => void;
  readonly label?: string;
}

export function ExternalReferencesEditor({
  references,
  onChange,
  label = "External references",
}: ExternalReferencesEditorProps): ReactElement {
  return (
    <fieldset>
      <legend>{label}</legend>
      {references.map((reference) => (
        <div key={`${reference.type}-${reference.id}-${reference.url ?? ""}`}>
          <label>
            Type
            <input
              value={reference.type}
              onChange={(event) =>
                onChange(
                  references.map((current) =>
                    current === reference ? { ...current, type: event.target.value } : current,
                  ),
                )
              }
            />
          </label>
          <label>
            ID
            <input
              value={reference.id}
              onChange={(event) =>
                onChange(
                  references.map((current) =>
                    current === reference ? { ...current, id: event.target.value } : current,
                  ),
                )
              }
            />
          </label>
          <label>
            URL
            <input
              type="url"
              value={reference.url ?? ""}
              onChange={(event) =>
                onChange(
                  references.map((current) =>
                    current === reference ? { ...current, url: event.target.value } : current,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(references.filter((current) => current !== reference))}
          >
            Remove reference
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...references, { type: "", id: "" }])}>
        Add reference
      </button>
    </fieldset>
  );
}

function MetadataSection({
  name,
  values,
  onChange,
  label,
}: {
  readonly name: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (values: Readonly<Record<string, unknown>>) => void;
  readonly label: string;
}): ReactElement {
  const entries = Object.entries(values);
  return (
    <fieldset>
      <legend>{label}</legend>
      {entries.map(([key, value]) => (
        <div key={`${name}-${key}`}>
          <label>
            Key
            <input
              value={key}
              onChange={(event) => {
                const next = { ...values };
                delete next[key];
                next[event.target.value] = value;
                onChange(next);
              }}
            />
          </label>
          <label>
            Value
            <input
              value={metadataValue(value)}
              onChange={(event) => {
                let nextValue: unknown = event.target.value;
                try {
                  nextValue = JSON.parse(event.target.value) as unknown;
                } catch {
                  /* plain text */
                }
                onChange({ ...values, [key]: nextValue });
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const next = { ...values };
              delete next[key];
              onChange(next);
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          let index = entries.length + 1;
          let key = `key${index}`;
          while (key in values) {
            index += 1;
            key = `key${index}`;
          }
          onChange({ ...values, [key]: "" });
        }}
      >
        Add field
      </button>
    </fieldset>
  );
}

export interface MetadataEditorProps<TLocale extends string = SupportedLocale>
  extends DictionaryProps<TLocale> {
  readonly publicMetadata?: Readonly<Record<string, unknown>>;
  readonly serverMetadata?: Readonly<Record<string, unknown>>;
  readonly onPublicMetadataChange: (metadata: Readonly<Record<string, unknown>>) => void;
  readonly onServerMetadataChange: (metadata: Readonly<Record<string, unknown>>) => void;
}

export function MetadataEditor<TLocale extends string = SupportedLocale>({
  publicMetadata = {},
  serverMetadata = {},
  onPublicMetadataChange,
  onServerMetadataChange,
  locale,
  dictionary,
}: MetadataEditorProps<TLocale>): ReactElement {
  const activeLocale = locale ?? ("en" as TLocale);
  return (
    <section aria-label={text(dictionary, activeLocale, "metadata", "Metadata")}>
      <MetadataSection
        name="public"
        values={publicMetadata}
        onChange={onPublicMetadataChange}
        label="Public metadata"
      />
      <MetadataSection
        name="server"
        values={serverMetadata}
        onChange={onServerMetadataChange}
        label="Server metadata"
      />
    </section>
  );
}

export function AdminRallyEditor<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({ config, onChange, locale, dictionary }: AdminRallyEditorProps<TLocale, TMeta>): ReactElement {
  const activeLocale = (locale ?? "en") as TLocale;
  const field = (key: string, fallback: string): string =>
    text(dictionary, activeLocale, key, fallback);
  const update = (next: Partial<AdminRallyConfig<TLocale, TMeta>>): void =>
    onChange({ ...config, ...next });
  const updateSpots = (spots: ReadonlyArray<SpotItem<TLocale, TMeta>>): void =>
    update({ spots: spots.map((spot, index) => ({ ...spot, orderIndex: index })) });
  return (
    <section aria-label={field("rallyEditor", "Rally editor")}>
      <h1>{resolveLocalizedText(config.title, activeLocale)}</h1>
      <label>
        {field("title", "Title")}
        <input
          value={resolveLocalizedText(config.title, activeLocale)}
          onChange={(event) =>
            update({ title: updateLocalizedField(config.title, activeLocale, event.target.value) })
          }
        />
      </label>
      <label>
        {field("description", "Description")}
        <textarea
          value={resolveLocalizedText(config.description ?? "", activeLocale)}
          onChange={(event) =>
            update({
              description: updateLocalizedField(
                config.description ?? "",
                activeLocale,
                event.target.value,
              ),
            })
          }
        />
      </label>
      <ThemeEditor
        theme={config.theme ?? DEFAULT_SHEET_THEME}
        locale={activeLocale}
        {...(dictionary === undefined ? {} : { dictionary })}
        onChange={(theme) => update({ theme })}
      />
      <label>
        {field("serverEndpoint", "Server endpoint")}
        <input
          value={config.serverEndpoint ?? ""}
          onChange={(event) => update({ serverEndpoint: event.target.value })}
        />
      </label>
      <MetadataEditor
        publicMetadata={config.publicMetadata ?? config.metadata ?? {}}
        serverMetadata={config.serverMetadata ?? {}}
        locale={activeLocale}
        {...(dictionary === undefined ? {} : { dictionary })}
        onPublicMetadataChange={(metadata) => update({ publicMetadata: metadata as TMeta })}
        onServerMetadataChange={(metadata) => update({ serverMetadata: metadata })}
      />
      <button
        type="button"
        onClick={() => updateSpots([...config.spots, newSpot<TLocale, TMeta>(config.spots.length)])}
      >
        {field("addSpot", "Add spot")}
      </button>
      <div>
        {config.spots.map((spot, index) => (
          <div key={spot.id}>
            <SpotItemForm<TLocale, TMeta>
              spot={spot}
              locale={activeLocale}
              {...(dictionary === undefined ? {} : { dictionary })}
              onChange={(next) =>
                updateSpots(
                  config.spots.map((current) => (current.id === spot.id ? next : current)),
                )
              }
              onRemove={() => updateSpots(config.spots.filter((current) => current.id !== spot.id))}
            />
            <button
              type="button"
              disabled={index === 0}
              onClick={() => updateSpots(move(config.spots, index, -1))}
            >
              {field("moveUp", "Move up")}
            </button>
            <button
              type="button"
              disabled={index === config.spots.length - 1}
              onClick={() => updateSpots(move(config.spots, index, 1))}
            >
              {field("moveDown", "Move down")}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => update({ rewards: [...config.rewards, newReward(config.rewards.length)] })}
      >
        {field("addReward", "Add reward")}
      </button>
      <div>
        {config.rewards.map((reward, index) => (
          <div key={reward.id}>
            <RewardItemForm
              reward={reward}
              locale={activeLocale}
              {...(dictionary === undefined ? {} : { dictionary })}
              onChange={(next) =>
                update({
                  rewards: config.rewards.map((current) =>
                    current.id === reward.id ? next : current,
                  ),
                })
              }
              onRemove={() =>
                update({ rewards: config.rewards.filter((current) => current.id !== reward.id) })
              }
            />
            <button
              type="button"
              disabled={index === 0}
              onClick={() => update({ rewards: move(config.rewards, index, -1) })}
            >
              {field("moveUp", "Move up")}
            </button>
            <button
              type="button"
              disabled={index === config.rewards.length - 1}
              onClick={() => update({ rewards: move(config.rewards, index, 1) })}
            >
              {field("moveDown", "Move down")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export const RallyEditor = AdminRallyEditor;

export interface GeneralSettingsFormProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> extends DictionaryProps<TLocale> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onChange: (config: AdminRallyConfig<TLocale, TMeta>) => void;
}
export function GeneralSettingsForm<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  config,
  onChange,
  locale,
  dictionary,
}: GeneralSettingsFormProps<TLocale, TMeta>): ReactElement {
  const activeLocale = locale ?? ("en" as TLocale);
  return (
    <label>
      {text(dictionary, activeLocale, "title", "Rally title")}
      <input
        value={resolveLocalizedText(config.title, activeLocale)}
        onChange={(event) =>
          onChange({
            ...config,
            title: updateLocalizedField(config.title, activeLocale, event.target.value),
          })
        }
      />
    </label>
  );
}

export interface JsonConfigIOProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> extends DictionaryProps<TLocale> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onImport: (config: AdminRallyConfig<TLocale, TMeta>) => void;
}
export function JsonConfigIO<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({ config, onImport, locale, dictionary }: JsonConfigIOProps<TLocale, TMeta>): ReactElement {
  const activeLocale = locale ?? ("en" as TLocale);
  const [value, setValue] = useState(() => JSON.stringify(config, null, 2));
  const [errors, setErrors] = useState<
    ReadonlyArray<{ readonly path: string; readonly message: string }>
  >([]);
  const field = (key: string, fallback: string): string =>
    text(dictionary, activeLocale, key, fallback);
  return (
    <div>
      <textarea
        aria-label={field("jsonConfig", "JSON configuration")}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setErrors([]);
        }}
      />
      <button
        type="button"
        onClick={() => {
          try {
            const result = safeParseAdminConfig(JSON.parse(value));
            if (!result.success) {
              setErrors(result.errors);
              return;
            }
            onImport(result.data as AdminRallyConfig<TLocale, TMeta>);
            setErrors([]);
          } catch {
            setErrors([{ path: "$", message: field("invalidJson", "Invalid JSON.") }]);
          }
        }}
      >
        {field("import", "Import")}
      </button>
      {errors.length > 0 && (
        <ul role="alert">
          {errors.map((error) => (
            <li key={`${error.path}-${error.message}`}>
              {error.path}: {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
