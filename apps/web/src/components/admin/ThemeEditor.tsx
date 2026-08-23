import { DEFAULT_SHEET_THEME, type SheetTheme, type SupportedLocale } from "@stamprally/core";
import { getMessages } from "../../locales/index.js";
import { ThemePresetSelector } from "./ThemePresetSelector.js";

interface ThemeEditorProps {
  readonly theme: SheetTheme | undefined;
  readonly locale: SupportedLocale;
  readonly onChange: (theme: SheetTheme) => void;
}

interface ColorFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function ColorField({ id, label, value, disabled = false, onChange }: ColorFieldProps) {
  return (
    <div className="theme-color-field">
      <label htmlFor={`${id}-text`}>{label}</label>
      <div className="theme-color-field__controls">
        <input
          id={`${id}-picker`}
          type="color"
          aria-label={`${label} color picker`}
          value={HEX_COLOR_PATTERN.test(value) ? value : "#000000"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          id={`${id}-text`}
          value={value}
          disabled={disabled}
          pattern="#[0-9a-fA-F]{6}"
          placeholder="#000000"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

export function ThemeEditor({ theme, locale, onChange }: ThemeEditorProps) {
  const messages = getMessages(locale);
  const resolved: SheetTheme = { ...DEFAULT_SHEET_THEME, ...theme };
  const hasCustomStampColor = resolved.completedStampColor !== undefined;

  function update(patch: Partial<SheetTheme>): void {
    onChange({ ...resolved, ...patch });
  }

  function toggleCompletedStampColor(enabled: boolean): void {
    if (enabled) {
      update({ completedStampColor: "#b33c2e" });
      return;
    }
    const { completedStampColor, ...withoutCompletedStampColor } = resolved;
    void completedStampColor;
    onChange(withoutCompletedStampColor);
  }

  return (
    <section className="admin-card theme-editor">
      <header className="theme-editor__header">
        <div>
          <h2>{messages.themeEditor}</h2>
          <p>{messages.themeDescription}</p>
        </div>
      </header>

      <ThemePresetSelector theme={resolved} locale={locale} onChange={onChange} />

      <details className="theme-custom-settings" open>
        <summary>{messages.customSettings}</summary>
        <div className="theme-custom-settings__content">
          <div className="theme-color-grid">
            <ColorField
              id="theme-primary"
              label={messages.primaryColor}
              value={resolved.primaryColor}
              onChange={(primaryColor) => update({ primaryColor })}
            />
            <ColorField
              id="theme-background"
              label={messages.sheetBackgroundColor}
              value={resolved.backgroundColor ?? DEFAULT_SHEET_THEME.backgroundColor ?? "#ffffff"}
              onChange={(backgroundColor) => update({ backgroundColor })}
            />
            <ColorField
              id="theme-card-background"
              label={messages.cardBackgroundColor}
              value={resolved.cardBackgroundColor}
              onChange={(cardBackgroundColor) => update({ cardBackgroundColor })}
            />
            <ColorField
              id="theme-text"
              label={messages.textColor}
              value={resolved.textColor}
              onChange={(textColor) => update({ textColor })}
            />
          </div>

          <div className="editor-grid editor-grid--three">
            <label>
              {messages.slotShape}
              <select
                value={resolved.slotShape}
                onChange={(event) =>
                  update({ slotShape: event.target.value as SheetTheme["slotShape"] })
                }
              >
                <option value="circle">{messages.shapeCircle}</option>
                <option value="square">{messages.shapeSquare}</option>
                <option value="rounded">{messages.shapeRounded}</option>
              </select>
            </label>
            <label>
              {messages.gridColumns}
              <select
                value={resolved.gridColumns}
                onChange={(event) => update({ gridColumns: Number(event.target.value) })}
              >
                {[1, 2, 3, 4].map((columns) => (
                  <option key={columns} value={columns}>
                    {messages.columnCount(columns)}
                  </option>
                ))}
              </select>
            </label>
            <div className="theme-opacity-field">
              <label htmlFor="theme-unclaimed-opacity">{messages.unclaimedOpacity}</label>
              <span className="theme-opacity-control">
                <input
                  id="theme-unclaimed-opacity"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={resolved.unclaimedOpacity ?? 1}
                  onChange={(event) => update({ unclaimedOpacity: Number(event.target.value) })}
                />
                <output>{(resolved.unclaimedOpacity ?? 1).toFixed(2)}</output>
              </span>
            </div>
          </div>

          <label>
            {messages.backgroundImageUrl}
            <input
              type="url"
              value={resolved.backgroundImageUrl ?? ""}
              placeholder="https://example.com/sheet-background.jpg"
              onChange={(event) => {
                const backgroundImageUrl = event.target.value.trim();
                if (backgroundImageUrl !== "") {
                  update({ backgroundImageUrl });
                  return;
                }
                const { backgroundImageUrl: removedBackgroundImageUrl, ...withoutBackgroundImage } =
                  resolved;
                void removedBackgroundImageUrl;
                onChange(withoutBackgroundImage);
              }}
            />
          </label>

          <label className="checkbox-label theme-stamp-color-toggle">
            <input
              type="checkbox"
              checked={hasCustomStampColor}
              onChange={(event) => toggleCompletedStampColor(event.target.checked)}
            />
            {messages.customStampColor}
          </label>
          <ColorField
            id="theme-completed-stamp"
            label={messages.completedStampColor}
            value={resolved.completedStampColor ?? "#b33c2e"}
            disabled={!hasCustomStampColor}
            onChange={(completedStampColor) => update({ completedStampColor })}
          />
        </div>
      </details>
    </section>
  );
}
