import type { StampCondition, SupportedLocale } from "@stamprally/core";
import { getMessages } from "../../locales/index.js";

interface ConditionEditorProps {
  readonly condition: StampCondition;
  readonly locale: SupportedLocale;
  readonly depth?: number;
  readonly onChange: (condition: StampCondition) => void;
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function defaultCondition(type: StampCondition["type"]): StampCondition {
  switch (type) {
    case "instant":
      return { type: "instant" };
    case "token":
      return { type: "token", token: "" };
    case "geo":
      return { type: "geo", latitude: 35.681236, longitude: 139.767125, radiusMeters: 100 };
    case "composite":
      return { type: "composite", operator: "AND", conditions: [{ type: "instant" }] };
    case "time_window": {
      const now = new Date();
      const later = new Date(now.getTime() + 3_600_000);
      return {
        type: "time_window",
        startsAt: now.toISOString(),
        endsAt: later.toISOString(),
        condition: { type: "instant" },
      };
    }
  }
}

export function ConditionEditor({ condition, locale, depth = 1, onChange }: ConditionEditorProps) {
  const messages = getMessages(locale);
  return (
    <fieldset className="condition-editor">
      <legend>{messages.condition}</legend>
      <label>
        Type
        <select
          value={condition.type}
          onChange={(event) =>
            onChange(defaultCondition(event.target.value as StampCondition["type"]))
          }
        >
          <option value="instant">instant</option>
          <option value="token">token</option>
          <option value="geo">geo</option>
          <option value="composite">composite</option>
          <option value="time_window">time_window</option>
        </select>
      </label>

      {condition.type === "token" && (
        <label>
          {messages.token}
          <input
            value={condition.token}
            onChange={(event) => onChange({ ...condition, token: event.target.value })}
          />
        </label>
      )}

      {condition.type === "geo" && (
        <div className="editor-grid editor-grid--three">
          <label>
            {messages.latitude}
            <input
              type="number"
              step="0.000001"
              value={condition.latitude}
              onChange={(event) => onChange({ ...condition, latitude: Number(event.target.value) })}
            />
          </label>
          <label>
            {messages.longitude}
            <input
              type="number"
              step="0.000001"
              value={condition.longitude}
              onChange={(event) =>
                onChange({ ...condition, longitude: Number(event.target.value) })
              }
            />
          </label>
          <label>
            {messages.radiusMeters}
            <input
              type="number"
              min="1"
              value={condition.radiusMeters}
              onChange={(event) =>
                onChange({ ...condition, radiusMeters: Number(event.target.value) })
              }
            />
          </label>
        </div>
      )}

      {condition.type === "composite" && (
        <div className="condition-children">
          <label>
            {messages.operator}
            <select
              value={condition.operator}
              onChange={(event) =>
                onChange({ ...condition, operator: event.target.value as "AND" | "OR" })
              }
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          </label>
          {condition.conditions.map((child, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Conditions have no IDs; the index is their editor path.
            <div className="condition-child" key={`${depth}-${index}-${child.type}`}>
              <ConditionEditor
                condition={child}
                locale={locale}
                depth={depth + 1}
                onChange={(next) =>
                  onChange({
                    ...condition,
                    conditions: condition.conditions.map((item, childIndex) =>
                      childIndex === index ? next : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={() =>
                  onChange({
                    ...condition,
                    conditions: condition.conditions.filter(
                      (_, childIndex) => childIndex !== index,
                    ),
                  })
                }
              >
                {messages.delete}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={depth >= 8}
            onClick={() =>
              onChange({ ...condition, conditions: [...condition.conditions, { type: "instant" }] })
            }
          >
            {messages.addCondition}
          </button>
        </div>
      )}

      {condition.type === "time_window" && (
        <div className="condition-children">
          <div className="editor-grid">
            <label>
              {messages.startsAt}
              <input
                type="datetime-local"
                value={toLocalDateTime(condition.startsAt)}
                onChange={(event) =>
                  onChange({ ...condition, startsAt: fromLocalDateTime(event.target.value) })
                }
              />
            </label>
            <label>
              {messages.endsAt}
              <input
                type="datetime-local"
                value={toLocalDateTime(condition.endsAt)}
                onChange={(event) =>
                  onChange({ ...condition, endsAt: fromLocalDateTime(event.target.value) })
                }
              />
            </label>
          </div>
          <ConditionEditor
            condition={condition.condition}
            locale={locale}
            depth={depth + 1}
            onChange={(next) => onChange({ ...condition, condition: next })}
          />
        </div>
      )}
    </fieldset>
  );
}
