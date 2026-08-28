import type {
  AdminRallyConfig,
  CheckInCondition,
  LocaleDictionary,
  Reward,
  RewardUnlockCondition,
  SpotItem,
  SupportedLocale,
} from "@stamprally/core";
import { resolveLocalizedText, safeParseAdminConfig, updateLocalizedField } from "@stamprally/core";
import { type ReactElement, useState } from "react";

export interface AdminRallyEditorProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onChange: (config: AdminRallyConfig<TLocale, TMeta>) => void;
  readonly locale?: string;
  readonly dictionary?: LocaleDictionary<TLocale>;
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
      <label>
        {field("externalReferences", "External references")}
        <textarea
          value={JSON.stringify(spot.externalReferences ?? [], null, 2)}
          onChange={(event) => {
            try {
              const parsed: unknown = JSON.parse(event.target.value);
              if (Array.isArray(parsed)) update({ externalReferences: parsed });
            } catch {
              // Keep the text editable until the JSON is complete.
            }
          }}
        />
      </label>
      <label>
        {field("metadata", "Metadata")}
        <textarea
          value={JSON.stringify(spot.metadata ?? {}, null, 2)}
          onChange={(event) => {
            try {
              const parsed: unknown = JSON.parse(event.target.value);
              if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
                update({ metadata: parsed as TMeta });
            } catch {
              // Keep the text editable until the JSON is complete.
            }
          }}
        />
      </label>
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

function RewardItemForm<TLocale extends string = SupportedLocale>({
  reward,
  locale,
  dictionary,
  onChange,
  onRemove,
}: {
  readonly reward: Reward<TLocale>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onChange: (reward: Reward<TLocale>) => void;
  readonly onRemove: () => void;
}): ReactElement {
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
      <label>
        {field("unlockConditions", "Unlock conditions")}
        <textarea
          value={JSON.stringify(reward.conditions ?? [], null, 2)}
          onChange={(event) => {
            try {
              const parsed: unknown = JSON.parse(event.target.value);
              if (Array.isArray(parsed))
                onChange({ ...reward, conditions: parsed as ReadonlyArray<RewardUnlockCondition> });
            } catch {
              // Keep the text editable until the JSON is complete.
            }
          }}
        />
      </label>
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
        {config.rewards.map((reward) => (
          <RewardItemForm
            key={reward.id}
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
