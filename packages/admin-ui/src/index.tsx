import {
  CURRENT_RALLY_CONFIG_VERSION,
  DEFAULT_SHEET_THEME,
  type LocalizedText,
  migrateRallyConfig,
  type RallyConfig,
  type RewardItem,
  resolveLocalizedText,
  type SheetTheme,
  type SpotItem,
  type StampCondition,
  type SupportedLocale,
  stripSensitiveConfig,
  THEME_PRESETS,
  validateRallyConfig,
} from "@stamprally/core";
import type { ChangeEvent } from "react";
import { useState } from "react";

const localePair = (value: LocalizedText | undefined): { ja: string; en: string } => ({
  ja: resolveLocalizedText(value, "ja"),
  en: resolveLocalizedText(value, "en"),
});

function updateText(
  value: LocalizedText | undefined,
  locale: "ja" | "en",
  next: string,
): LocalizedText {
  const current = localePair(value);
  return { ...current, [locale]: next };
}

export interface GeneralSettingsFormProps {
  readonly config: RallyConfig;
  readonly locale?: SupportedLocale;
  readonly onChange: (config: RallyConfig) => void;
}
export function GeneralSettingsForm({ config, locale = "ja", onChange }: GeneralSettingsFormProps) {
  const pair = localePair(config.title);
  return (
    <fieldset className="stamprally-admin-card">
      <legend>General settings</legend>
      <label>
        ID <input value={config.id} readOnly />
      </label>
      <label>
        Title ({locale}){" "}
        <input
          value={pair[locale]}
          required
          onChange={(event) =>
            onChange({ ...config, title: updateText(config.title, locale, event.target.value) })
          }
        />
      </label>
      <label>
        Start date{" "}
        <input
          type="datetime-local"
          value={config.startDate?.slice(0, 16) ?? ""}
          onChange={(event) => {
            if (event.target.value === "") {
              const { startDate: _startDate, ...rest } = config;
              onChange(rest);
            } else onChange({ ...config, startDate: new Date(event.target.value).toISOString() });
          }}
        />
      </label>
      <label>
        End date{" "}
        <input
          type="datetime-local"
          value={config.endDate?.slice(0, 16) ?? ""}
          onChange={(event) => {
            if (event.target.value === "") {
              const { endDate: _endDate, ...rest } = config;
              onChange(rest);
            } else onChange({ ...config, endDate: new Date(event.target.value).toISOString() });
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.isSequential === true}
          onChange={(event) => onChange({ ...config, isSequential: event.target.checked })}
        />{" "}
        Sequential check-in
      </label>
    </fieldset>
  );
}

export interface ConditionEditorProps {
  readonly condition: StampCondition;
  readonly onChange: (condition: StampCondition) => void;
  readonly locale?: SupportedLocale;
}
export function ConditionEditor({ condition, onChange }: ConditionEditorProps) {
  const type = condition.type;
  return (
    <fieldset className="stamprally-admin-card">
      <legend>Check-in condition</legend>
      <label>
        Type{" "}
        <select
          value={type}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "token") onChange({ type: "token", token: "" });
            else if (next === "geo")
              onChange({ type: "geo", latitude: 0, longitude: 0, radiusMeters: 100 });
            else onChange({ type: "instant" });
          }}
        >
          <option value="instant">Instant</option>
          <option value="token">QR / passcode</option>
          <option value="geo">GPS</option>
        </select>
      </label>
      {condition.type === "token" && (
        <label>
          Token{" "}
          <input
            value={condition.token}
            onChange={(event) => onChange({ ...condition, token: event.target.value })}
          />
        </label>
      )}
      {condition.type === "geo" && (
        <>
          <label>
            Latitude{" "}
            <input
              type="number"
              min={-90}
              max={90}
              value={condition.latitude}
              onChange={(event) => onChange({ ...condition, latitude: Number(event.target.value) })}
            />
          </label>
          <label>
            Longitude{" "}
            <input
              type="number"
              min={-180}
              max={180}
              value={condition.longitude}
              onChange={(event) =>
                onChange({ ...condition, longitude: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Radius (m){" "}
            <input
              type="number"
              min={1}
              value={condition.radiusMeters}
              onChange={(event) =>
                onChange({ ...condition, radiusMeters: Number(event.target.value) })
              }
            />
          </label>
        </>
      )}
    </fieldset>
  );
}

export interface SpotItemFormProps {
  readonly spot: SpotItem;
  readonly index?: number;
  readonly locale?: SupportedLocale;
  readonly onChange: (spot: SpotItem) => void;
  readonly onDelete?: () => void;
}
export function SpotItemForm({
  spot,
  index = 0,
  locale = "ja",
  onChange,
  onDelete,
}: SpotItemFormProps) {
  const pair = localePair(spot.name);
  const setField = (
    field: "iconUrl" | "imageUrl" | "externalUrl" | "guideId" | "groupId" | "deckId",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (event.target.value === "") {
      const { [field]: _removed, ...rest } = spot;
      onChange(rest);
    } else onChange({ ...spot, [field]: event.target.value });
  };
  return (
    <article className="stamprally-admin-card">
      <header>
        <strong>Spot {index + 1}</strong>
        {onDelete !== undefined && (
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        )}
      </header>
      <label>
        ID{" "}
        <input
          value={spot.id}
          onChange={(event) => onChange({ ...spot, id: event.target.value })}
        />
      </label>
      <label>
        Name ({locale}){" "}
        <input
          value={pair[locale]}
          required
          onChange={(event) =>
            onChange({ ...spot, name: updateText(spot.name, locale, event.target.value) })
          }
        />
      </label>
      <label>
        Icon URL{" "}
        <input value={spot.iconUrl ?? ""} onChange={(event) => setField("iconUrl", event)} />
      </label>
      <label>
        Image URL{" "}
        <input value={spot.imageUrl ?? ""} onChange={(event) => setField("imageUrl", event)} />
      </label>
      <label>
        External URL{" "}
        <input
          value={spot.externalUrl ?? ""}
          onChange={(event) => setField("externalUrl", event)}
        />
      </label>
      <ConditionEditor
        condition={spot.condition}
        onChange={(condition) => onChange({ ...spot, condition })}
        locale={locale}
      />
    </article>
  );
}

export interface SpotListEditorProps {
  readonly spots: ReadonlyArray<SpotItem>;
  readonly locale?: SupportedLocale;
  readonly onChange: (spots: ReadonlyArray<SpotItem>) => void;
}
export function SpotListEditor({ spots, locale = "ja", onChange }: SpotListEditorProps) {
  return (
    <section aria-label="Spots">
      <h2>Spots</h2>
      {spots.map((spot, index) => (
        <SpotItemForm
          key={spot.id}
          spot={spot}
          index={index}
          locale={locale}
          onChange={(next) =>
            onChange(spots.map((item, itemIndex) => (itemIndex === index ? next : item)))
          }
          onDelete={() => onChange(spots.filter((_, itemIndex) => itemIndex !== index))}
        />
      ))}
    </section>
  );
}

export interface RewardListEditorProps {
  readonly rewards: ReadonlyArray<RewardItem>;
  readonly locale?: SupportedLocale;
  readonly onChange: (rewards: ReadonlyArray<RewardItem>) => void;
}
export function RewardListEditor({ rewards, locale = "ja", onChange }: RewardListEditorProps) {
  return (
    <section aria-label="Rewards">
      <h2>Rewards</h2>
      {rewards.map((reward, index) => (
        <article className="stamprally-admin-card" key={reward.id}>
          <label>
            ID{" "}
            <input
              value={reward.id}
              onChange={(event) =>
                onChange(
                  rewards.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, id: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <label>
            Title ({locale}){" "}
            <input
              value={resolveLocalizedText(reward.title, locale)}
              onChange={(event) =>
                onChange(
                  rewards.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, title: updateText(item.title, locale, event.target.value) }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label>
            Required stamps{" "}
            <input
              type="number"
              min={0}
              value={reward.requiredStampCount}
              onChange={(event) =>
                onChange(
                  rewards.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, requiredStampCount: Number(event.target.value) }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label>
            Valid until{" "}
            <input
              type="datetime-local"
              value={reward.validUntil?.slice(0, 16) ?? ""}
              onChange={(event) =>
                onChange(
                  rewards.map((item, itemIndex) => {
                    if (itemIndex !== index) return item;
                    if (event.target.value === "") {
                      const { validUntil: _validUntil, ...rest } = item;
                      return rest;
                    }
                    return { ...item, validUntil: new Date(event.target.value).toISOString() };
                  }),
                )
              }
            />
          </label>
        </article>
      ))}
    </section>
  );
}

export interface ThemePresetSelectorProps {
  readonly value?: SheetTheme;
  readonly locale?: SupportedLocale;
  readonly onChange: (theme: SheetTheme) => void;
}
export function ThemePresetSelector({ value, locale = "ja", onChange }: ThemePresetSelectorProps) {
  const selected =
    THEME_PRESETS.find((preset) => JSON.stringify(preset.theme) === JSON.stringify(value))?.id ??
    "custom";
  return (
    <label>
      Theme preset{" "}
      <select
        value={selected}
        onChange={(event) => {
          const preset = THEME_PRESETS.find((item) => item.id === event.target.value);
          if (preset !== undefined) onChange(preset.theme);
        }}
      >
        <option value="custom">Custom</option>
        {THEME_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {resolveLocalizedText(preset.name, locale)}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface ThemeEditorProps {
  readonly theme?: SheetTheme;
  readonly locale?: SupportedLocale;
  readonly onChange: (theme: SheetTheme) => void;
}
export function ThemeEditor({
  theme = DEFAULT_SHEET_THEME,
  locale = "ja",
  onChange,
}: ThemeEditorProps) {
  const update = (field: keyof SheetTheme, value: string | number) =>
    onChange({ ...theme, [field]: value });
  return (
    <fieldset className="stamprally-admin-card">
      <legend>Theme</legend>
      <ThemePresetSelector value={theme} locale={locale} onChange={onChange} />
      <label>
        Primary color{" "}
        <input
          type="color"
          value={theme.primaryColor}
          onChange={(event) => update("primaryColor", event.target.value)}
        />
      </label>
      <label>
        Grid columns{" "}
        <input
          type="number"
          min={1}
          max={6}
          value={theme.gridColumns}
          onChange={(event) => update("gridColumns", Number(event.target.value))}
        />
      </label>
    </fieldset>
  );
}

export interface QrExportModalProps {
  readonly open: boolean;
  readonly config: RallyConfig;
  readonly locale?: SupportedLocale;
  readonly onClose: () => void;
}
export function QrExportModal({ open, config, locale = "ja", onClose }: QrExportModalProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="stamprally-qr-modal">
      <div className="stamprally-qr-modal__toolbar">
        <h2>QR print kit</h2>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="stamprally-qr-modal__grid">
        {config.stamps.map((spot) => (
          <article key={spot.id}>
            <h3>{resolveLocalizedText(spot.name, locale)}</h3>
            <pre>
              {JSON.stringify({
                version: CURRENT_RALLY_CONFIG_VERSION,
                rallyId: config.id,
                stampId: spot.id,
              })}
            </pre>
          </article>
        ))}
      </div>
    </div>
  );
}

export interface JsonConfigIOProps {
  readonly config: RallyConfig;
  readonly onImport: (config: RallyConfig) => void;
  readonly locale?: SupportedLocale;
}
export function JsonConfigIO({ config, onImport }: JsonConfigIOProps) {
  const [value, setValue] = useState(() => JSON.stringify(stripSensitiveConfig(config), null, 2));
  const [error, setError] = useState<string | null>(null);
  const importConfig = (): void => {
    try {
      const migrated = migrateRallyConfig(JSON.parse(value) as unknown);
      const validation = validateRallyConfig(migrated);
      if (!validation.valid) {
        setError(validation.errors.map((item) => `${item.path}: ${item.message}`).join(" "));
        return;
      }
      onImport(migrated);
      setError(null);
    } catch {
      setError("Invalid rally JSON.");
    }
  };
  return (
    <section className="stamprally-admin-card" aria-label="JSON configuration">
      <textarea value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" onClick={importConfig}>
        Import and migrate
      </button>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard?.writeText(JSON.stringify(stripSensitiveConfig(config), null, 2))
        }
      >
        Copy public JSON
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}

export interface RallyEditorProps {
  readonly config: RallyConfig;
  readonly locale?: SupportedLocale;
  readonly onChange: (config: RallyConfig) => void;
}
export function RallyEditor({ config, locale = "ja", onChange }: RallyEditorProps) {
  const [showQr, setShowQr] = useState(false);
  return (
    <main className="stamprally-admin">
      <header>
        <h1>{resolveLocalizedText(config.title, locale) || config.id}</h1>
        <button type="button" onClick={() => setShowQr(true)}>
          QR export
        </button>
      </header>
      <GeneralSettingsForm config={config} locale={locale} onChange={onChange} />
      {config.theme === undefined ? (
        <ThemeEditor locale={locale} onChange={(theme) => onChange({ ...config, theme })} />
      ) : (
        <ThemeEditor
          theme={config.theme}
          locale={locale}
          onChange={(theme) => onChange({ ...config, theme })}
        />
      )}
      <SpotListEditor
        spots={config.stamps}
        locale={locale}
        onChange={(stamps) => onChange({ ...config, stamps })}
      />
      <RewardListEditor
        rewards={config.rewards ?? []}
        locale={locale}
        onChange={(rewards) => onChange({ ...config, rewards })}
      />
      <JsonConfigIO config={config} onImport={onChange} />
      <QrExportModal
        open={showQr}
        config={config}
        locale={locale}
        onClose={() => setShowQr(false)}
      />
    </main>
  );
}
