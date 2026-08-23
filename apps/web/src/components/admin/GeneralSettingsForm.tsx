import {
  type LocalizedString,
  type RallyConfig,
  type SupportedLocale,
  toLocalizedString,
} from "@stamprally/core";
import { getMessages } from "../../locales/index.js";
import { LocalizedFields } from "./LocalizedFields.js";

interface GeneralSettingsFormProps {
  readonly config: RallyConfig;
  readonly locale: SupportedLocale;
  readonly onChange: (config: RallyConfig) => void;
}

export function GeneralSettingsForm({ config, locale, onChange }: GeneralSettingsFormProps) {
  const messages = getMessages(locale);
  const setTitle = (title: LocalizedString) => onChange({ ...config, title });
  const setDescription = (description: LocalizedString) => onChange({ ...config, description });
  return (
    <section className="admin-card">
      <h2>{messages.general}</h2>
      <label>
        ID
        <input value={config.id} readOnly />
      </label>
      <LocalizedFields
        id="rally-title"
        label={messages.title}
        value={toLocalizedString(config.title)}
        requiredJapanese={true}
        fallbackHelp={messages.englishFallback}
        onChange={setTitle}
      />
      <LocalizedFields
        id="rally-description"
        label={messages.description}
        value={config.description}
        multiline={true}
        fallbackHelp={messages.englishFallback}
        onChange={setDescription}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={config.isSequential === true}
          onChange={(event) => onChange({ ...config, isSequential: event.target.checked })}
        />
        {messages.sequential}
      </label>
    </section>
  );
}
