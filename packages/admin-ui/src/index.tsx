import {
  type AdminRallyConfig,
  type AdminReward,
  CURRENT_RALLY_CONFIG_VERSION,
  DEFAULT_SHEET_THEME,
  type ExternalReference,
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
  type UniversalSpotItem,
  type VerificationCondition,
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

function universalText(value: LocalizedText | undefined, locale: string): string {
  return typeof value === "string" ? value : (value?.[locale] ?? "");
}

function updateUniversalText(
  value: LocalizedText | undefined,
  locale: string,
  next: string,
): LocalizedText {
  return { ...(typeof value === "string" ? {} : value), [locale]: next };
}

const newUniversalCondition = (): VerificationCondition => ({ type: "passcode", code: "" });

function defaultUniversalSpot(index: number): UniversalSpotItem {
  return {
    id: `spot-${index + 1}`,
    orderIndex: index,
    name: { ja: `スポット ${index + 1}`, en: `Spot ${index + 1}` },
    conditions: [newUniversalCondition()],
  };
}

function defaultUniversalReward(index: number): AdminReward {
  return {
    id: `reward-${index + 1}`,
    title: { ja: `景品 ${index + 1}`, en: `Reward ${index + 1}` },
    type: "digital",
    redemptionMethod: "manual_slide",
    requiredStampCount: 1,
  };
}

function updateUniversalCondition(
  condition: VerificationCondition,
  field: string,
  value: string,
): VerificationCondition {
  if (condition.type === "gps") {
    return { ...condition, [field]: Number(value) } as VerificationCondition;
  }
  return { ...condition, [field]: value } as VerificationCondition;
}

interface UniversalSpotFormProps {
  readonly spot: UniversalSpotItem;
  readonly spots: ReadonlyArray<UniversalSpotItem>;
  readonly onChange: (spot: UniversalSpotItem) => void;
  readonly onDelete: () => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
}

function UniversalSpotForm({
  spot,
  spots,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: UniversalSpotFormProps) {
  const update = (next: Partial<UniversalSpotItem>): void => onChange({ ...spot, ...next });
  const references = spot.externalReferences ?? [];
  const conditions = spot.conditions;
  return (
    <fieldset className="stamprally-admin-card" aria-label={`Spot ${spot.id}`}>
      <legend>Spot {spot.orderIndex + 1}</legend>
      <label>
        ID <input value={spot.id} onChange={(event) => update({ id: event.target.value })} />
      </label>
      <label>
        Name (ja){" "}
        <input
          value={universalText(spot.name, "ja")}
          onChange={(event) =>
            update({ name: updateUniversalText(spot.name, "ja", event.target.value) })
          }
        />
      </label>
      <label>
        Name (en){" "}
        <input
          value={universalText(spot.name, "en")}
          onChange={(event) =>
            update({ name: updateUniversalText(spot.name, "en", event.target.value) })
          }
        />
      </label>
      <label>
        Description (ja){" "}
        <textarea
          value={universalText(spot.description, "ja")}
          onChange={(event) =>
            update({ description: updateUniversalText(spot.description, "ja", event.target.value) })
          }
        />
      </label>
      <label>
        Order index{" "}
        <input
          type="number"
          value={spot.orderIndex}
          onChange={(event) => update({ orderIndex: Number(event.target.value) })}
        />
      </label>
      <label>
        Prerequisite spot
        <select
          value=""
          onChange={(event) => {
            if (event.target.value !== "")
              update({ prerequisites: [...(spot.prerequisites ?? []), event.target.value] });
          }}
        >
          <option value="">Select a prerequisite</option>
          {spots
            .filter((item) => item.id !== spot.id && !spot.prerequisites?.includes(item.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
        </select>
      </label>
      {(spot.prerequisites ?? []).map((id) => (
        <button
          type="button"
          key={id}
          onClick={() =>
            update({ prerequisites: (spot.prerequisites ?? []).filter((item) => item !== id) })
          }
        >
          Remove prerequisite: {id}
        </button>
      ))}
      <div>
        <h4>External references</h4>
        {references.map((reference, index) => (
          <div key={`${reference.type}:${reference.id}`}>
            <label>
              Reference type{" "}
              <input
                value={reference.type}
                onChange={(event) =>
                  update({
                    externalReferences: references.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, type: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <label>
              Reference ID{" "}
              <input
                value={reference.id}
                onChange={(event) =>
                  update({
                    externalReferences: references.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, id: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <label>
              Reference URL{" "}
              <input
                value={reference.url ?? ""}
                onChange={(event) =>
                  update({
                    externalReferences: references.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, url: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <label>
              Reference metadata{" "}
              <textarea
                value={JSON.stringify(reference.metadata ?? {}, null, 2)}
                onChange={(event) => {
                  try {
                    const metadata: unknown = JSON.parse(event.target.value);
                    if (
                      typeof metadata === "object" &&
                      metadata !== null &&
                      !Array.isArray(metadata)
                    )
                      update({
                        externalReferences: references.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, metadata: metadata as Readonly<Record<string, unknown>> }
                            : item,
                        ),
                      });
                  } catch {
                    // Keep the last valid metadata while editing.
                  }
                }}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                update({
                  externalReferences: references.filter((_, itemIndex) => itemIndex !== index),
                })
              }
            >
              Remove reference
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update({
              externalReferences: [...references, { type: "", id: "" } as ExternalReference],
            })
          }
        >
          Add external reference
        </button>
      </div>
      <div>
        <h4>Conditions</h4>
        {conditions.map((condition, index) => (
          <div key={JSON.stringify(condition)}>
            <label>
              Condition type
              <select
                value={condition.type}
                onChange={(event) => {
                  const next: VerificationCondition =
                    event.target.value === "qr"
                      ? { type: "qr", secretToken: "" }
                      : event.target.value === "gps"
                        ? { type: "gps", latitude: 0, longitude: 0, radiusMeters: 100 }
                        : event.target.value === "custom"
                          ? { type: "custom", validatorName: "" }
                          : { type: "passcode", code: "" };
                  onChange({
                    ...spot,
                    conditions: conditions.map((item, itemIndex) =>
                      itemIndex === index ? next : item,
                    ),
                  });
                }}
              >
                <option value="qr">QR</option>
                <option value="passcode">Passcode</option>
                <option value="gps">GPS</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {condition.type === "qr" && (
              <label>
                QR secret token{" "}
                <input
                  value={condition.secretToken}
                  onChange={(event) =>
                    onChange({
                      ...spot,
                      conditions: conditions.map((item, itemIndex) =>
                        itemIndex === index
                          ? updateUniversalCondition(item, "secretToken", event.target.value)
                          : item,
                      ),
                    })
                  }
                />
              </label>
            )}
            {condition.type === "passcode" && (
              <label>
                Passcode{" "}
                <input
                  value={condition.code}
                  onChange={(event) =>
                    onChange({
                      ...spot,
                      conditions: conditions.map((item, itemIndex) =>
                        itemIndex === index
                          ? updateUniversalCondition(item, "code", event.target.value)
                          : item,
                      ),
                    })
                  }
                />
              </label>
            )}
            {condition.type === "custom" && (
              <label>
                Validator name{" "}
                <input
                  value={condition.validatorName}
                  onChange={(event) =>
                    onChange({
                      ...spot,
                      conditions: conditions.map((item, itemIndex) =>
                        itemIndex === index
                          ? updateUniversalCondition(item, "validatorName", event.target.value)
                          : item,
                      ),
                    })
                  }
                />
              </label>
            )}
            {condition.type === "gps" && (
              <>
                <label>
                  Latitude{" "}
                  <input
                    type="number"
                    value={condition.latitude}
                    onChange={(event) =>
                      onChange({
                        ...spot,
                        conditions: conditions.map((item, itemIndex) =>
                          itemIndex === index
                            ? updateUniversalCondition(item, "latitude", event.target.value)
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Longitude{" "}
                  <input
                    type="number"
                    value={condition.longitude}
                    onChange={(event) =>
                      onChange({
                        ...spot,
                        conditions: conditions.map((item, itemIndex) =>
                          itemIndex === index
                            ? updateUniversalCondition(item, "longitude", event.target.value)
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Radius meters{" "}
                  <input
                    type="number"
                    value={condition.radiusMeters}
                    onChange={(event) =>
                      onChange({
                        ...spot,
                        conditions: conditions.map((item, itemIndex) =>
                          itemIndex === index
                            ? updateUniversalCondition(item, "radiusMeters", event.target.value)
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              </>
            )}
            {conditions.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  update({ conditions: conditions.filter((_, itemIndex) => itemIndex !== index) })
                }
              >
                Remove condition
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => update({ conditions: [...conditions, newUniversalCondition()] })}
        >
          Add condition
        </button>
      </div>
      <button type="button" onClick={onMoveUp} disabled={spot.orderIndex === 0}>
        Move spot up
      </button>
      <button type="button" onClick={onMoveDown} disabled={spot.orderIndex === spots.length - 1}>
        Move spot down
      </button>
      <button type="button" onClick={onDelete}>
        Remove spot
      </button>
    </fieldset>
  );
}

function UniversalRewardForm({
  reward,
  spots,
  onChange,
  onDelete,
}: {
  readonly reward: AdminReward;
  readonly spots: ReadonlyArray<UniversalSpotItem>;
  readonly onChange: (reward: AdminReward) => void;
  readonly onDelete: () => void;
}) {
  const update = (next: Partial<AdminReward>): void => onChange({ ...reward, ...next });
  const conditions = reward.conditions ?? [];
  return (
    <fieldset className="stamprally-admin-card" aria-label={`Reward ${reward.id}`}>
      <legend>Reward</legend>
      <label>
        ID <input value={reward.id} onChange={(event) => update({ id: event.target.value })} />
      </label>
      <label>
        Title (ja){" "}
        <input
          value={universalText(reward.title, "ja")}
          onChange={(event) =>
            update({ title: updateUniversalText(reward.title, "ja", event.target.value) })
          }
        />
      </label>
      <label>
        Title (en){" "}
        <input
          value={universalText(reward.title, "en")}
          onChange={(event) =>
            update({ title: updateUniversalText(reward.title, "en", event.target.value) })
          }
        />
      </label>
      <label>
        Required stamps{" "}
        <input
          type="number"
          min={0}
          value={reward.requiredStampCount}
          onChange={(event) => update({ requiredStampCount: Number(event.target.value) })}
        />
      </label>
      <label>
        Stock limit{" "}
        <input
          type="number"
          min={0}
          value={reward.stockLimit ?? ""}
          onChange={(event) => {
            if (event.target.value === "") {
              const { stockLimit: _removed, ...rest } = reward;
              onChange(rest);
            } else update({ stockLimit: Number(event.target.value) });
          }}
        />
      </label>
      <label>
        User claim limit{" "}
        <input
          type="number"
          min={0}
          value={reward.userClaimLimit ?? ""}
          onChange={(event) => {
            if (event.target.value === "") {
              const { userClaimLimit: _removed, ...rest } = reward;
              onChange(rest);
            } else update({ userClaimLimit: Number(event.target.value) });
          }}
        />
      </label>
      <label>
        Staff passcode{" "}
        <input
          type="password"
          value={reward.staffPasscode ?? ""}
          onChange={(event) => {
            if (event.target.value === "") {
              const { staffPasscode: _removed, ...rest } = reward;
              onChange(rest);
            } else update({ staffPasscode: event.target.value });
          }}
        />
      </label>
      <label>
        Redemption method{" "}
        <select
          value={reward.redemptionMethod}
          onChange={(event) =>
            update({ redemptionMethod: event.target.value as AdminReward["redemptionMethod"] })
          }
        >
          <option value="manual_slide">manual_slide</option>
          <option value="staff_passcode">staff_passcode</option>
          <option value="view_only">view_only</option>
          <option value="server_claim">server_claim</option>
        </select>
      </label>
      <div>
        <h4>Unlock conditions</h4>
        {conditions.map((condition, index) => (
          <div key={JSON.stringify(condition)}>
            <label>
              Reward condition type{" "}
              <select
                value={condition.type}
                onChange={(event) => {
                  const type = event.target.value;
                  const next: NonNullable<AdminReward["conditions"]>[number] =
                    type === "stamps"
                      ? { type: "stamps", stampIds: [] }
                      : type === "all" || type === "any"
                        ? { type, conditions: [{ type: "stamp_count", count: 1 }] }
                        : { type: "stamp_count", count: 1 };
                  update({
                    conditions: conditions.map((item, itemIndex) =>
                      itemIndex === index ? next : item,
                    ),
                  });
                }}
              >
                <option value="stamp_count">Stamp count</option>
                <option value="stamps">Specific spots</option>
                <option value="all">All</option>
                <option value="any">Any</option>
              </select>
            </label>
            {condition.type === "stamp_count" && (
              <label>
                Required stamp count{" "}
                <input
                  type="number"
                  min={0}
                  value={condition.count}
                  onChange={(event) =>
                    update({
                      conditions: conditions.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...condition, count: Number(event.target.value) }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            )}
            {condition.type === "stamps" && (
              <label>
                Specific spot IDs{" "}
                <input
                  value={condition.stampIds.join(", ")}
                  placeholder={spots.map((item) => item.id).join(", ")}
                  onChange={(event) =>
                    update({
                      conditions: conditions.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...condition,
                              stampIds: event.target.value
                                .split(",")
                                .map((id) => id.trim())
                                .filter(Boolean),
                            }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            )}
            <button
              type="button"
              onClick={() =>
                update({ conditions: conditions.filter((_, itemIndex) => itemIndex !== index) })
              }
            >
              Remove reward condition
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => update({ conditions: [...conditions, { type: "stamp_count", count: 1 }] })}
        >
          Add reward condition
        </button>
      </div>
      <button type="button" onClick={onDelete}>
        Remove reward
      </button>
    </fieldset>
  );
}

/** Universal-model GUI editor. JSON import/export remains available as a separate component. */
export function AdminRallyEditor<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({ config, locale = "ja" as TLocale, onChange }: AdminRallyEditorProps<TLocale, TMeta>) {
  const spots = config.spots as ReadonlyArray<UniversalSpotItem>;
  const rewards = config.rewards as ReadonlyArray<AdminReward>;
  const theme = config.theme ?? DEFAULT_SHEET_THEME;
  const setConfig = (next: Partial<AdminRallyConfig>): void =>
    onChange({ ...config, ...next } as AdminRallyConfig<TLocale, TMeta>);
  return (
    <section aria-label="Universal rally editor" className="stamprally-admin-card">
      <fieldset>
        <legend>Basic settings</legend>
        <label>
          Title ({locale}){" "}
          <input
            value={universalText(config.title, locale)}
            onChange={(event) =>
              setConfig({
                title: updateUniversalText(
                  config.title,
                  locale,
                  event.target.value,
                ) as TLocale extends string ? AdminRallyConfig<TLocale, TMeta>["title"] : never,
              })
            }
          />
        </label>
        <label>
          Description ({locale}){" "}
          <textarea
            value={universalText(config.description, locale)}
            onChange={(event) => {
              if (event.target.value === "") {
                const { description: _removed, ...rest } = config;
                onChange(rest);
              } else
                setConfig({
                  description: updateUniversalText(config.description, locale, event.target.value),
                });
            }}
          />
        </label>
        <label>
          Theme preset{" "}
          <select
            value={
              THEME_PRESETS.find((preset) => JSON.stringify(preset.theme) === JSON.stringify(theme))
                ?.id ?? "custom"
            }
            onChange={(event) => {
              const preset = THEME_PRESETS.find((item) => item.id === event.target.value);
              if (preset !== undefined) setConfig({ theme: preset.theme });
            }}
          >
            <option value="custom">custom</option>
            {THEME_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {resolveLocalizedText(preset.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Primary color{" "}
          <input
            type="color"
            value={theme.primaryColor}
            onChange={(event) =>
              setConfig({ theme: { ...theme, primaryColor: event.target.value } })
            }
          />
        </label>
        <label>
          Font family{" "}
          <select
            value={theme.fontFamily ?? "serif"}
            onChange={(event) =>
              setConfig({
                theme: {
                  ...theme,
                  fontFamily: event.target.value as NonNullable<SheetTheme["fontFamily"]>,
                },
              })
            }
          >
            <option value="system-ui">system-ui</option>
            <option value="serif">serif</option>
            <option value="rounded-sans">rounded-sans</option>
            <option value="monospace">monospace</option>
            <option value="handwritten">handwritten</option>
          </select>
        </label>
      </fieldset>
      <section aria-label="Universal spots">
        <h2>Spots</h2>
        {spots.map((spot, index) => (
          <UniversalSpotForm
            key={spot.id}
            spot={spot}
            spots={spots}
            onChange={(next) =>
              setConfig({
                spots: spots.map((item, itemIndex) =>
                  itemIndex === index ? { ...next, orderIndex: next.orderIndex } : item,
                ),
              })
            }
            onMoveUp={() => {
              if (index === 0) return;
              const current = spots[index];
              const previous = spots[index - 1];
              if (current === undefined || previous === undefined) return;
              const reordered = spots.map((item, itemIndex) =>
                itemIndex === index - 1
                  ? { ...current, orderIndex: index - 1 }
                  : itemIndex === index
                    ? { ...previous, orderIndex: index }
                    : item,
              );
              setConfig({ spots: reordered });
            }}
            onMoveDown={() => {
              if (index === spots.length - 1) return;
              const current = spots[index];
              const next = spots[index + 1];
              if (current === undefined || next === undefined) return;
              const reordered = spots.map((item, itemIndex) =>
                itemIndex === index
                  ? { ...next, orderIndex: index }
                  : itemIndex === index + 1
                    ? { ...current, orderIndex: index + 1 }
                    : item,
              );
              setConfig({ spots: reordered });
            }}
            onDelete={() =>
              setConfig({
                spots: spots
                  .filter((_, itemIndex) => itemIndex !== index)
                  .map((item, itemIndex) => ({ ...item, orderIndex: itemIndex })),
              })
            }
          />
        ))}
        <button
          type="button"
          onClick={() => setConfig({ spots: [...spots, defaultUniversalSpot(spots.length)] })}
        >
          Add spot
        </button>
      </section>
      <section aria-label="Universal rewards">
        <h2>Rewards</h2>
        {rewards.map((reward, index) => (
          <UniversalRewardForm
            key={reward.id}
            reward={reward}
            spots={spots}
            onChange={(next) =>
              setConfig({
                rewards: rewards.map((item, itemIndex) => (itemIndex === index ? next : item)),
              })
            }
            onDelete={() =>
              setConfig({ rewards: rewards.filter((_, itemIndex) => itemIndex !== index) })
            }
          />
        ))}
        <button
          type="button"
          onClick={() =>
            setConfig({ rewards: [...rewards, defaultUniversalReward(rewards.length)] })
          }
        >
          Add reward
        </button>
      </section>
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
