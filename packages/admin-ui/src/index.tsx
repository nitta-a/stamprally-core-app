import {
  type AdminRallyConfig,
  CURRENT_RALLY_CONFIG_VERSION,
  DEFAULT_SHEET_THEME,
  type LocaleDictionary,
  type LocalizedText,
  migrateRallyConfig,
  type RallyConfig,
  type RewardItem,
  type RewardUnlockCondition,
  resolveLocalizedText,
  type SheetTheme,
  type SpotItem,
  type StampCondition,
  type SupportedLocale,
  stripSensitiveConfig,
  THEME_PRESETS,
  toPublicRallyConfig,
  validateAdminRallyConfig,
  validateRallyConfig,
} from "@stamprally/core";
import type { ChangeEvent } from "react";
import { useState } from "react";

export type { LocaleDictionary } from "@stamprally/core";

export interface AdminRallyEditorProps<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly locale?: TLocale;
  readonly onChange: (config: AdminRallyConfig<TLocale, TMeta>) => void;
}

/** Universal-model editor surface; the existing field editors remain available for legacy demos. */
export function AdminRallyEditor<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({ config, onChange }: AdminRallyEditorProps<TLocale, TMeta>) {
  const [value, setValue] = useState(() => JSON.stringify(config, null, 2));
  const [error, setError] = useState<string | null>(null);
  const apply = (): void => {
    try {
      const candidate: unknown = JSON.parse(value);
      const result = validateAdminRallyConfig(candidate);
      if (!result.valid) {
        setError(result.errors.map((item) => `${item.path}: ${item.message}`).join(" "));
        return;
      }
      onChange(candidate as AdminRallyConfig<TLocale, TMeta>);
      setError(null);
    } catch {
      setError("Invalid rally JSON.");
    }
  };
  return (
    <section aria-label="Universal rally editor" className="stamprally-admin-card">
      <textarea value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" onClick={apply}>
        Apply configuration
      </button>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard?.writeText(JSON.stringify(toPublicRallyConfig(config), null, 2))
        }
      >
        Copy public configuration
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}

const localePair = (value: LocalizedText | undefined): Record<string, string> => {
  if (typeof value === "string") return { ja: value, en: "" };
  const result: Record<string, string> = {};
  for (const [key, text] of Object.entries(value ?? {})) {
    if (text !== undefined) result[key] = text;
  }
  return result;
};

function updateText(value: LocalizedText | undefined, locale: string, next: string): LocalizedText {
  const current = localePair(value);
  return { ...current, [locale]: next };
}

export interface GeneralSettingsFormProps<TLocale extends string = SupportedLocale> {
  readonly config: RallyConfig<TLocale>;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onChange: (config: RallyConfig<TLocale>) => void;
}
export function GeneralSettingsForm<TLocale extends string = SupportedLocale>({
  config,
  locale = "ja" as TLocale,
  onChange,
}: GeneralSettingsFormProps<TLocale>) {
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
  readonly locale?: SupportedLocale | (string & {});
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

export interface SpotItemFormProps<TLocale extends string = SupportedLocale> {
  readonly spot: SpotItem<TLocale>;
  readonly index?: number;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onChange: (spot: SpotItem<TLocale>) => void;
  readonly onDelete?: () => void;
}
export function SpotItemForm<TLocale extends string = SupportedLocale>({
  spot,
  index = 0,
  locale = "ja" as TLocale,
  onChange,
  onDelete,
}: SpotItemFormProps<TLocale>) {
  const pair = localePair(spot.name);
  const setField = (
    field:
      | "iconUrl"
      | "imageUrl"
      | "externalUrl"
      | "guideId"
      | "groupId"
      | "deckId"
      | "redirectUrlAfterClaim",
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
        Description ({locale}){" "}
        <textarea
          value={resolveLocalizedText(spot.description, locale)}
          onChange={(event) =>
            onChange({
              ...spot,
              description: updateText(spot.description, locale, event.target.value),
            })
          }
        />
      </label>
      <label>
        Hint ({locale}){" "}
        <textarea
          value={resolveLocalizedText(spot.hint, locale)}
          onChange={(event) =>
            onChange({ ...spot, hint: updateText(spot.hint, locale, event.target.value) })
          }
        />
      </label>
      <label>
        Order index{" "}
        <input
          type="number"
          value={spot.orderIndex ?? spot.order ?? index + 1}
          onChange={(event) => onChange({ ...spot, orderIndex: Number(event.target.value) })}
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
      <label>
        Redirect URL after claim{" "}
        <input
          value={spot.redirectUrlAfterClaim ?? ""}
          onChange={(event) => setField("redirectUrlAfterClaim", event)}
        />
      </label>
      <label>
        Prerequisites (comma-separated stamp IDs){" "}
        <input
          value={(spot.requiresStampIds ?? spot.dependsOn ?? []).join(", ")}
          onChange={(event) => {
            const ids = event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            if (ids.length === 0) {
              const { requiresStampIds: _requiresStampIds, ...rest } = spot;
              onChange(rest);
            } else onChange({ ...spot, requiresStampIds: ids });
          }}
        />
      </label>
      <label>
        Metadata (JSON){" "}
        <textarea
          value={JSON.stringify(spot.metadata ?? {}, null, 2)}
          onChange={(event) => {
            try {
              const parsed: unknown = JSON.parse(event.target.value);
              if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                onChange({ ...spot, metadata: parsed as Record<string, unknown> });
              }
            } catch {
              // Keep the last valid metadata while the user edits JSON.
            }
          }}
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

export interface SpotListEditorProps<TLocale extends string = SupportedLocale> {
  readonly spots: ReadonlyArray<SpotItem<TLocale>>;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onChange: (spots: ReadonlyArray<SpotItem<TLocale>>) => void;
}
export function SpotListEditor<TLocale extends string = SupportedLocale>({
  spots,
  locale = "ja" as TLocale,
  onChange,
}: SpotListEditorProps<TLocale>) {
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

export interface RewardListEditorProps<TLocale extends string = SupportedLocale> {
  readonly rewards: ReadonlyArray<RewardItem<TLocale>>;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onChange: (rewards: ReadonlyArray<RewardItem<TLocale>>) => void;
}
export function RewardListEditor<TLocale extends string = SupportedLocale>({
  rewards,
  locale = "ja" as TLocale,
  onChange,
}: RewardListEditorProps<TLocale>) {
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
            Description ({locale}){" "}
            <textarea
              value={resolveLocalizedText(reward.description, locale)}
              onChange={(event) =>
                onChange(
                  rewards.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          description: updateText(item.description, locale, event.target.value),
                        }
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
          <label>
            Stock limit{" "}
            <input
              type="number"
              min={1}
              value={reward.stockLimit ?? reward.maxStock ?? ""}
              onChange={(event) =>
                onChange(
                  rewards.map((item, itemIndex) => {
                    if (itemIndex !== index) return item;
                    if (event.target.value === "") {
                      const { stockLimit: _stockLimit, ...rest } = item;
                      return rest;
                    }
                    return { ...item, stockLimit: Number(event.target.value) };
                  }),
                )
              }
            />
          </label>
          <label>
            User claim limit{" "}
            <input
              type="number"
              min={1}
              value={reward.userClaimLimit ?? reward.limitPerUser ?? ""}
              onChange={(event) =>
                onChange(
                  rewards.map((item, itemIndex) => {
                    if (itemIndex !== index) return item;
                    if (event.target.value === "") {
                      const { userClaimLimit: _userClaimLimit, ...rest } = item;
                      return rest;
                    }
                    return { ...item, userClaimLimit: Number(event.target.value) };
                  }),
                )
              }
            />
          </label>
          <label>
            Redemption method{" "}
            <select
              value={reward.redemptionMethod}
              onChange={(event) =>
                onChange(
                  rewards.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          redemptionMethod: event.target.value as RewardItem["redemptionMethod"],
                        }
                      : item,
                  ),
                )
              }
            >
              <option value="manual_slide">manual_slide</option>
              <option value="staff_passcode">staff_passcode</option>
              <option value="view_only">view_only</option>
              <option value="server_claim">server_claim</option>
            </select>
          </label>
          {reward.redemptionMethod === "staff_passcode" && (
            <label>
              Staff passcode{" "}
              <input
                type="password"
                value={reward.staffPasscode ?? ""}
                onChange={(event) =>
                  onChange(
                    rewards.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, staffPasscode: event.target.value } : item,
                    ),
                  )
                }
              />
            </label>
          )}
          <label>
            Conditions (JSON){" "}
            <textarea
              value={JSON.stringify(reward.conditions ?? [], null, 2)}
              onChange={(event) => {
                try {
                  const parsed: unknown = JSON.parse(event.target.value);
                  if (Array.isArray(parsed)) {
                    onChange(
                      rewards.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, conditions: parsed as ReadonlyArray<RewardUnlockCondition> }
                          : item,
                      ),
                    );
                  }
                } catch {
                  // Keep the last valid condition set while the user edits JSON.
                }
              }}
            />
          </label>
        </article>
      ))}
    </section>
  );
}

export interface ThemePresetSelectorProps {
  readonly value?: SheetTheme;
  readonly locale?: SupportedLocale | (string & {});
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
  readonly locale?: SupportedLocale | (string & {});
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

export interface QrExportModalProps<TLocale extends string = SupportedLocale> {
  readonly open: boolean;
  readonly config: RallyConfig<TLocale>;
  readonly locale?: TLocale;
  readonly onClose: () => void;
}
export function QrExportModal<TLocale extends string = SupportedLocale>({
  open,
  config,
  locale = "ja" as TLocale,
  onClose,
}: QrExportModalProps<TLocale>) {
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

export interface JsonConfigIOProps<TLocale extends string = SupportedLocale> {
  readonly config: RallyConfig<TLocale>;
  readonly onImport: (config: RallyConfig<TLocale>) => void;
  readonly locale?: TLocale;
}
export function JsonConfigIO<TLocale extends string = SupportedLocale>({
  config,
  onImport,
}: JsonConfigIOProps<TLocale>) {
  const [value, setValue] = useState(() => JSON.stringify(stripSensitiveConfig(config), null, 2));
  const [error, setError] = useState<string | null>(null);
  const importConfig = (): void => {
    try {
      const migrated = migrateRallyConfig<TLocale>(JSON.parse(value) as unknown);
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

export interface RallyEditorProps<TLocale extends string = SupportedLocale> {
  readonly config: RallyConfig<TLocale>;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onChange: (config: RallyConfig<TLocale>) => void;
}
export function RallyEditor<TLocale extends string = SupportedLocale>({
  config,
  locale = "ja" as TLocale,
  onChange,
}: RallyEditorProps<TLocale>) {
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
