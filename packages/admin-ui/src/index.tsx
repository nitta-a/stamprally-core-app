import type {
  AdminRallyConfig,
  CheckInCondition,
  LocaleDictionary,
  Reward,
  SpotItem,
  SupportedLocale,
} from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import { type ChangeEvent, type ReactElement, useState } from "react";

export interface AdminRallyEditorProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onChange: (config: AdminRallyConfig<TLocale, TMeta>) => void;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
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
export function AdminRallyEditor<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  config,
  onChange,
  locale = "en" as TLocale,
}: AdminRallyEditorProps<TLocale, TMeta>): ReactElement {
  const update = (next: Partial<AdminRallyConfig<TLocale, TMeta>>): void =>
    onChange({ ...config, ...next });
  return (
    <section aria-label="Rally editor">
      <h1>{resolveLocalizedText(config.title, locale)}</h1>
      <label>
        Title
        <input
          value={resolveLocalizedText(config.title, locale)}
          onChange={(event) => update({ title: event.target.value })}
        />
      </label>
      <button
        type="button"
        onClick={() =>
          update({ spots: [...config.spots, newSpot<TLocale, TMeta>(config.spots.length)] })
        }
      >
        Add spot
      </button>
      <button
        type="button"
        onClick={() => update({ rewards: [...config.rewards, newReward(config.rewards.length)] })}
      >
        Add reward
      </button>
      <ul>
        {config.spots.map((spot) => (
          <li key={spot.id}>{resolveLocalizedText(spot.name, locale)}</li>
        ))}
      </ul>
    </section>
  );
}
export const RallyEditor = AdminRallyEditor;
export interface SpotItemFormProps<TLocale extends string = SupportedLocale> {
  readonly spot: SpotItem<TLocale>;
  readonly onChange: (spot: SpotItem<TLocale>) => void;
}
export function SpotItemForm<TLocale extends string = SupportedLocale>({
  spot,
  onChange,
}: SpotItemFormProps<TLocale>): ReactElement {
  return (
    <label>
      Spot name
      <input
        value={resolveLocalizedText(spot.name, "en")}
        onChange={(event) => onChange({ ...spot, name: event.target.value })}
      />
    </label>
  );
}
export interface GeneralSettingsFormProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onChange: (config: AdminRallyConfig<TLocale, TMeta>) => void;
}
export function GeneralSettingsForm<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({ config, onChange }: GeneralSettingsFormProps<TLocale, TMeta>): ReactElement {
  return (
    <label>
      Rally title
      <input
        value={resolveLocalizedText(config.title, "en")}
        onChange={(event) => onChange({ ...config, title: event.target.value })}
      />
    </label>
  );
}
export interface JsonConfigIOProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onImport: (config: AdminRallyConfig<TLocale, TMeta>) => void;
}
export function JsonConfigIO<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({ config, onImport }: JsonConfigIOProps<TLocale, TMeta>): ReactElement {
  const [value, setValue] = useState(() => JSON.stringify(config, null, 2));
  const parse = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setValue(event.target.value);
  };
  return (
    <div>
      <textarea value={value} onChange={parse} />
      <button
        type="button"
        onClick={() => {
          try {
            onImport(JSON.parse(value) as AdminRallyConfig<TLocale, TMeta>);
          } catch {
            /* invalid JSON remains local */
          }
        }}
      >
        Import
      </button>
    </div>
  );
}
