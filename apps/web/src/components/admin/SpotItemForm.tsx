import type { LocalizedString, SpotItem, SupportedLocale } from "@stamprally/core";
import { getMessages } from "../../locales/index.js";
import { ConditionEditor } from "./ConditionEditor.js";
import { LocalizedFields } from "./LocalizedFields.js";

interface SpotItemFormProps {
  readonly spot: SpotItem;
  readonly index: number;
  readonly count: number;
  readonly locale: SupportedLocale;
  readonly onChange: (spot: SpotItem) => void;
  readonly onDelete: () => void;
  readonly onMove: (direction: -1 | 1) => void;
}

export function SpotItemForm({
  spot,
  index,
  count,
  locale,
  onChange,
  onDelete,
  onMove,
}: SpotItemFormProps) {
  const messages = getMessages(locale);
  return (
    <article className="admin-card admin-item">
      <header className="admin-item__header">
        <strong>
          #{String(index + 1).padStart(2, "0")} · {spot.id}
        </strong>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            {messages.moveUp}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            {messages.moveDown}
          </button>
          <button type="button" className="secondary-button danger-button" onClick={onDelete}>
            {messages.delete}
          </button>
        </div>
      </header>
      <LocalizedFields
        id={`spot-${spot.id}-name`}
        label={messages.name}
        value={spot.name}
        requiredJapanese={true}
        fallbackHelp={messages.englishFallback}
        onChange={(name: LocalizedString) => onChange({ ...spot, name })}
      />
      <LocalizedFields
        id={`spot-${spot.id}-description`}
        label={messages.description}
        value={spot.description}
        multiline={true}
        fallbackHelp={messages.englishFallback}
        onChange={(description) => onChange({ ...spot, description })}
      />
      <LocalizedFields
        id={`spot-${spot.id}-hint`}
        label={messages.hint}
        value={spot.hint}
        multiline={true}
        fallbackHelp={messages.englishFallback}
        onChange={(hint) => onChange({ ...spot, hint })}
      />
      <label>
        {messages.order}
        <input
          type="number"
          value={spot.order ?? index + 1}
          onChange={(event) => onChange({ ...spot, order: Number(event.target.value) })}
        />
      </label>
      <ConditionEditor
        condition={spot.condition}
        locale={locale}
        onChange={(condition) => onChange({ ...spot, condition })}
      />
    </article>
  );
}
