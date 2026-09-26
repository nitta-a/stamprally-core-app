import type { AvailabilityException, AvailabilityHours, SpotAvailability } from "@stamprally/core";
import type { ReactElement } from "react";

export interface AvailabilityEditorProps {
  readonly value?: SpotAvailability;
  readonly locale?: string;
  readonly dictionary?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly onChange: (value: SpotAvailability | undefined) => void;
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const defaultHours: AvailabilityHours = { opensAt: "09:00", closesAt: "17:00" };

export function AvailabilityEditor({
  value,
  locale = "en",
  dictionary,
  onChange,
}: AvailabilityEditorProps): ReactElement {
  const weekly = value?.weekly ?? [];
  const exceptions = value?.exceptions ?? [];
  const update = (patch: Partial<SpotAvailability>): void => onChange({ ...value, ...patch });
  const label = (key: string, fallback: string): string =>
    dictionary?.[locale]?.[`availability.editor.${key}`] ?? fallback;
  const updateHours = (
    list: ReadonlyArray<AvailabilityHours>,
    set: (hours: ReadonlyArray<AvailabilityHours>) => void,
    index: number,
    key: keyof AvailabilityHours,
    next: string,
  ): void =>
    set(list.map((hours, itemIndex) => (itemIndex === index ? { ...hours, [key]: next } : hours)));
  const updateException = (index: number, patch: Partial<AvailabilityException>): void =>
    update({
      exceptions: exceptions.map((exception, itemIndex) =>
        itemIndex === index ? { ...exception, ...patch } : exception,
      ),
    });
  return (
    <fieldset>
      <legend>{label("openingHours", "Opening hours")}</legend>
      <label>
        {label("timezone", "Timezone")}
        <input
          value={value?.timezone ?? ""}
          placeholder="Asia/Tokyo"
          onChange={(event) => {
            if (event.target.value === "") {
              const { timezone: _timezone, ...rest } = value ?? {};
              onChange(Object.keys(rest).length === 0 ? undefined : rest);
            } else update({ timezone: event.target.value });
          }}
        />
      </label>
      {weekdays.map((fallbackName, dayOfWeek) => {
        const name = label(`weekday.${dayOfWeek}`, fallbackName);
        const schedule = weekly.find((item) => item.dayOfWeek === dayOfWeek);
        return (
          <fieldset key={name}>
            <legend>{name}</legend>
            {schedule === undefined ? (
              <button
                type="button"
                onClick={() =>
                  update({ weekly: [...weekly, { dayOfWeek, hours: [defaultHours] }] })
                }
              >
                {label("addHours", "Add hours")}
              </button>
            ) : (
              <>
                {schedule.hours.map((hours, index) => (
                  <div key={`${name}-${hours.opensAt}-${hours.closesAt}`}>
                    <label>
                      {label("opensAt", "Opens at")}{" "}
                      <input
                        type="time"
                        value={hours.opensAt}
                        onChange={(event) =>
                          updateHours(
                            schedule.hours,
                            (next) =>
                              update({
                                weekly: weekly.map((item) =>
                                  item.dayOfWeek === dayOfWeek ? { ...item, hours: next } : item,
                                ),
                              }),
                            index,
                            "opensAt",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      {label("closesAt", "Closes at")}{" "}
                      <input
                        type="time"
                        value={hours.closesAt}
                        onChange={(event) =>
                          updateHours(
                            schedule.hours,
                            (next) =>
                              update({
                                weekly: weekly.map((item) =>
                                  item.dayOfWeek === dayOfWeek ? { ...item, hours: next } : item,
                                ),
                              }),
                            index,
                            "closesAt",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          weekly: weekly.map((item) =>
                            item.dayOfWeek === dayOfWeek
                              ? {
                                  ...item,
                                  hours: item.hours.filter((_, hourIndex) => hourIndex !== index),
                                }
                              : item,
                          ),
                        })
                      }
                    >
                      {label("removePeriod", "Remove period")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    update({
                      weekly: weekly.map((item) =>
                        item.dayOfWeek === dayOfWeek
                          ? { ...item, hours: [...item.hours, defaultHours] }
                          : item,
                      ),
                    })
                  }
                >
                  {label("addPeriod", "Add period")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update({ weekly: weekly.filter((item) => item.dayOfWeek !== dayOfWeek) })
                  }
                >
                  {label("removeDay", "Remove day")}
                </button>
              </>
            )}
          </fieldset>
        );
      })}
      <fieldset>
        <legend>{label("specialDates", "Special dates")}</legend>
        {exceptions.map((exception, index) => (
          <div key={exception.date || "new-exception"}>
            <label>
              {label("date", "Date")}{" "}
              <input
                type="date"
                value={exception.date}
                onChange={(event) => updateException(index, { date: event.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={exception.closed === true}
                onChange={(event) =>
                  updateException(
                    index,
                    event.target.checked ? { closed: true } : { closed: false },
                  )
                }
              />{" "}
              {label("closed", "Closed")}
            </label>
            {exception.closed !== true && (
              <>
                {(exception.hours ?? []).map((hours, hourIndex) => (
                  <div key={`${exception.date}-${hours.opensAt}-${hours.closesAt}`}>
                    <label>
                      {label("opensAt", "Opens at")}{" "}
                      <input
                        type="time"
                        value={hours.opensAt}
                        onChange={(event) =>
                          updateException(index, {
                            hours: (exception.hours ?? []).map((current, itemIndex) =>
                              itemIndex === hourIndex
                                ? { ...current, opensAt: event.target.value }
                                : current,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      {label("closesAt", "Closes at")}{" "}
                      <input
                        type="time"
                        value={hours.closesAt}
                        onChange={(event) =>
                          updateException(index, {
                            hours: (exception.hours ?? []).map((current, itemIndex) =>
                              itemIndex === hourIndex
                                ? { ...current, closesAt: event.target.value }
                                : current,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        updateException(index, {
                          hours: (exception.hours ?? []).filter(
                            (_, itemIndex) => itemIndex !== hourIndex,
                          ),
                        })
                      }
                    >
                      {label("removePeriod", "Remove period")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateException(index, { hours: [...(exception.hours ?? []), defaultHours] })
                  }
                >
                  {label("addSpecialHours", "Add special hours")}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() =>
                update({ exceptions: exceptions.filter((_, itemIndex) => itemIndex !== index) })
              }
            >
              {label("removeDate", "Remove date")}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={exceptions.some(({ date }) => date === "")}
          onClick={() => update({ exceptions: [...exceptions, { date: "", closed: true }] })}
        >
          {label("addSpecialDate", "Add special date")}
        </button>
      </fieldset>
      <button type="button" onClick={() => onChange(undefined)}>
        {label("removeOpeningHours", "Remove opening hours")}
      </button>
    </fieldset>
  );
}
