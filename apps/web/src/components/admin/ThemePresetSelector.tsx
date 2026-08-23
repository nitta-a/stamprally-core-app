import {
  resolveLocalizedText,
  type SheetTheme,
  type SlotShape,
  type SupportedLocale,
  THEME_PRESETS,
} from "@stamprally/core";
import { useState } from "react";
import { getMessages } from "../../locales/index.js";

interface ThemePresetSelectorProps {
  readonly theme: SheetTheme;
  readonly locale: SupportedLocale;
  readonly onChange: (theme: SheetTheme) => void;
}

function themesMatch(left: SheetTheme, right: SheetTheme): boolean {
  return (
    left.primaryColor === right.primaryColor &&
    (left.backgroundColor ?? "") === (right.backgroundColor ?? "") &&
    (left.backgroundImageUrl ?? "") === (right.backgroundImageUrl ?? "") &&
    left.cardBackgroundColor === right.cardBackgroundColor &&
    left.textColor === right.textColor &&
    left.slotShape === right.slotShape &&
    left.gridColumns === right.gridColumns &&
    (left.unclaimedOpacity ?? 1) === (right.unclaimedOpacity ?? 1) &&
    (left.completedStampColor ?? "") === (right.completedStampColor ?? "")
  );
}

export function ThemePresetSelector({ theme, locale, onChange }: ThemePresetSelectorProps) {
  const messages = getMessages(locale);
  const [announcement, setAnnouncement] = useState("");
  const selectedPreset = THEME_PRESETS.find((preset) => themesMatch(theme, preset.theme));

  function shapeLabel(shape: SlotShape): string {
    switch (shape) {
      case "circle":
        return messages.shapeCircle;
      case "square":
        return messages.shapeSquare;
      case "rounded":
        return messages.shapeRounded;
    }
  }

  return (
    <section className="theme-preset-selector" aria-labelledby="theme-presets-title">
      <div className="theme-preset-selector__heading">
        <div>
          <h3 id="theme-presets-title">{messages.themePresets}</h3>
          <p>{messages.themePresetsDescription}</p>
        </div>
        <p className="theme-preset-selector__status">
          {selectedPreset === undefined
            ? messages.customTheme
            : `${messages.selectedPreset}: ${resolveLocalizedText(selectedPreset.name, locale)}`}
        </p>
      </div>

      <div className="theme-preset-grid">
        {THEME_PRESETS.map((preset) => {
          const name = resolveLocalizedText(preset.name, locale);
          const description = resolveLocalizedText(preset.description, locale);
          const isSelected = preset.id === selectedPreset?.id;
          const swatches = [
            [messages.sheetBackgroundColor, preset.theme.backgroundColor ?? "#ffffff"],
            [messages.primaryColor, preset.theme.primaryColor],
            [messages.cardBackgroundColor, preset.theme.cardBackgroundColor],
            [messages.completedStampColor, preset.theme.completedStampColor ?? "#b33c2e"],
          ] as const;

          return (
            <button
              key={preset.id}
              type="button"
              className="theme-preset-card"
              aria-label={messages.applyPreset(name)}
              aria-pressed={isSelected}
              onClick={() => {
                onChange({ ...preset.theme });
                setAnnouncement(messages.presetApplied(name));
              }}
            >
              <span className="theme-preset-card__copy">
                <strong>{name}</strong>
                <span>{description}</span>
              </span>
              <span className="theme-preset-swatches">
                <span className="visually-hidden">{messages.colorPalette}</span>
                {swatches.map(([label, color]) => (
                  <span
                    key={label}
                    className="theme-preset-swatch"
                    role="img"
                    aria-label={`${label}: ${color}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="theme-preset-card__badges">
                <span>{shapeLabel(preset.theme.slotShape)}</span>
                <span>{messages.columnCount(preset.theme.gridColumns)}</span>
              </span>
              <span className="theme-preset-card__action">{messages.applyPresetAction}</span>
            </button>
          );
        })}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
