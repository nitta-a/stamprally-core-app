import { type LocalizedString, type LocalizedText, toLocalizedString } from "@stamprally/core";

interface LocalizedFieldsProps {
  readonly id: string;
  readonly label: string;
  readonly value: LocalizedText | undefined;
  readonly multiline?: boolean;
  readonly requiredJapanese?: boolean;
  readonly fallbackHelp: string;
  readonly onChange: (value: LocalizedString) => void;
}

export function LocalizedFields({
  id,
  label,
  value,
  multiline = false,
  requiredJapanese = false,
  fallbackHelp,
  onChange,
}: LocalizedFieldsProps) {
  const localized = toLocalizedString(value);
  const Input = multiline ? "textarea" : "input";
  return (
    <div className="localized-fields">
      <label htmlFor={`${id}-ja`}>
        {label} · 日本語
        <Input
          id={`${id}-ja`}
          value={localized.ja}
          required={requiredJapanese}
          onChange={(event) => onChange({ ...localized, ja: event.target.value })}
        />
      </label>
      <label htmlFor={`${id}-en`}>
        {label} · English
        <Input
          id={`${id}-en`}
          value={localized.en}
          onChange={(event) => onChange({ ...localized, en: event.target.value })}
        />
        {localized.en.trim() === "" && <small>{fallbackHelp}</small>}
      </label>
    </div>
  );
}
