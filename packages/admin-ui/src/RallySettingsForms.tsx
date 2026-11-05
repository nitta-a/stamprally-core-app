import type { AdminRallyConfig, LocaleDictionary } from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import type { ReactElement } from "react";
import { formatDateTimeLocal, parseDateTimeLocal } from "./availabilityDateTime.js";

interface SettingsProps<TLocale extends string, TMeta extends Record<string, unknown>> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onChange: (config: AdminRallyConfig<TLocale, TMeta>) => void;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
}

export interface RallyAvailabilityFormProps<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> extends SettingsProps<TLocale, TMeta> {
  readonly defaultTimezone?: string;
  readonly help?: string;
  readonly helpClassName?: string;
  readonly dateFieldsClassName?: string;
}

export function RallyAvailabilityForm<
  TLocale extends string,
  TMeta extends Record<string, unknown>,
>(props: RallyAvailabilityFormProps<TLocale, TMeta>): ReactElement {
  const {
    config,
    onChange,
    locale,
    dictionary,
    defaultTimezone,
    help,
    helpClassName,
    dateFieldsClassName,
  } = props;
  const field = (key: string, fallback: string) => dictionary?.[locale]?.[key] ?? fallback;
  const timezone = config.availability?.timezone ?? defaultTimezone ?? "UTC";
  return (
    <fieldset>
      <legend>{field("rallyAvailability", "Rally availability")}</legend>
      {help !== undefined && <p className={helpClassName}>{help}</p>}
      <div className={dateFieldsClassName}>
        {(["startsAt", "endsAt"] as const).map((key) => (
          <label key={key}>
            {field(`availability.${key}`, key)}
            <input
              type="datetime-local"
              value={
                config.availability?.[key] === undefined
                  ? ""
                  : formatDateTimeLocal(config.availability[key], timezone)
              }
              onChange={(event) => {
                const availability = { ...config.availability };
                if (defaultTimezone !== undefined && availability.timezone === undefined)
                  availability.timezone = defaultTimezone;
                if (event.target.value === "") delete availability[key];
                else {
                  const parsed = parseDateTimeLocal(event.target.value, timezone);
                  if (parsed === undefined) return;
                  availability[key] = parsed;
                }
                onChange({ ...config, availability });
              }}
            />
          </label>
        ))}
      </div>
      <label>
        {field("availability.timezone", "Timezone")}
        <input
          value={config.availability?.timezone ?? defaultTimezone ?? ""}
          placeholder="Asia/Tokyo"
          onChange={(event) => {
            const availability = { ...config.availability };
            if (event.target.value === "" && defaultTimezone === undefined)
              delete availability.timezone;
            else availability.timezone = event.target.value;
            onChange({ ...config, availability });
          }}
        />
      </label>
    </fieldset>
  );
}

export interface CompletionConditionFormProps<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> extends SettingsProps<TLocale, TMeta> {
  readonly initialCount?: number;
  readonly initialStampIds?: ReadonlyArray<string>;
  readonly spotSelectionClassName?: string;
}

export function CompletionConditionForm<
  TLocale extends string,
  TMeta extends Record<string, unknown>,
>(props: CompletionConditionFormProps<TLocale, TMeta>): ReactElement {
  const {
    config,
    onChange,
    locale,
    dictionary,
    initialCount = 1,
    initialStampIds,
    spotSelectionClassName,
  } = props;
  const field = (key: string, fallback: string) => dictionary?.[locale]?.[key] ?? fallback;
  const completion = config.completion?.condition ?? { type: "all_spots" as const };
  return (
    <fieldset data-field="completion">
      <legend>{field("completion", "Completion condition")}</legend>
      <label>
        {field("completionType", "Condition")}
        <select
          value={completion.type}
          onChange={(event) => {
            const type = event.target.value;
            if (type === "stamp_count")
              onChange({ ...config, completion: { condition: { type, count: initialCount } } });
            else if (type === "stamps")
              onChange({
                ...config,
                completion: {
                  condition: {
                    type,
                    stampIds:
                      initialStampIds ??
                      (config.spots[0] === undefined ? [] : [config.spots[0].id]),
                  },
                },
              });
            else onChange({ ...config, completion: { condition: { type: "all_spots" } } });
          }}
        >
          <option value="all_spots">{field("completion.allSpots", "All spots")}</option>
          <option value="stamp_count">{field("completion.stampCount", "Stamp count")}</option>
          <option value="stamps">{field("completion.selectedSpots", "Selected spots")}</option>
        </select>
      </label>
      {completion.type === "stamp_count" && (
        <label>
          {field("completion.requiredStamps", "Required stamps")}
          <input
            type="number"
            min={1}
            value={completion.count}
            onChange={(event) =>
              onChange({
                ...config,
                completion: {
                  condition: { type: "stamp_count", count: Number(event.target.value) },
                },
              })
            }
          />
        </label>
      )}
      {completion.type === "stamps" && (
        <div className={spotSelectionClassName}>
          {config.spots.map((spot) => (
            <label key={spot.id}>
              <input
                type="checkbox"
                checked={completion.stampIds.includes(spot.id)}
                onChange={(event) => {
                  const stampIds = completion.stampIds.filter((id) => id !== spot.id);
                  if (event.target.checked) stampIds.push(spot.id);
                  onChange({ ...config, completion: { condition: { type: "stamps", stampIds } } });
                }}
              />
              {resolveLocalizedText(spot.name, locale)}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
