import type { SupportedLocale } from "@stamprally/core";
import { getMessages } from "../locales/index.js";

export interface LanguageSelectorProps {
  readonly locale: SupportedLocale;
  readonly onChange: (locale: SupportedLocale) => void;
}

export function LanguageSelector({ locale, onChange }: LanguageSelectorProps) {
  const messages = getMessages(locale);
  return (
    <fieldset className="language-selector">
      <legend>{messages.language}</legend>
      {(["ja", "en"] as const).map((value) => (
        <label key={value} className={locale === value ? "active" : ""}>
          <input
            type="radio"
            name="display-language"
            value={value}
            checked={locale === value}
            onChange={() => onChange(value)}
          />
          <span>{value === "ja" ? messages.japanese : messages.english}</span>
        </label>
      ))}
    </fieldset>
  );
}
