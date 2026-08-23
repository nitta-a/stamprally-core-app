import {
  calculateProgress,
  type RallyConfig,
  type RewardItem,
  type SpotItem,
  type SupportedLocale,
} from "@stamprally/core";
import { useEffect, useMemo, useState } from "react";
import {
  DRAFT_CONFIG_KEY,
  loadStoredRallyConfig,
  normalizeRallyConfig,
  PUBLISHED_CONFIG_KEY,
  parseRallyConfig,
  parseRallyConfigJson,
  saveStoredRallyConfig,
  serializeRallyConfig,
} from "../../configIO.js";
import { DEFAULT_RALLY_CONFIG } from "../../demoConfig.js";
import { getMessages } from "../../locales/index.js";
import { LanguageSelector } from "../LanguageSelector.js";
import { StampSheet } from "../StampSheet.js";
import { GeneralSettingsForm } from "./GeneralSettingsForm.js";
import { QrExportModal } from "./QrExportModal.js";
import { RewardListEditor } from "./RewardListEditor.js";
import { SpotItemForm } from "./SpotItemForm.js";
import { ThemeEditor } from "./ThemeEditor.js";
import "./admin.css";

interface RallyEditorProps {
  readonly locale: SupportedLocale;
  readonly onLocaleChange: (locale: SupportedLocale) => void;
}

function uniqueId(prefix: string, ids: ReadonlyArray<string>): string {
  const existing = new Set(ids);
  let index = 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function moveItem<T>(items: ReadonlyArray<T>, index: number, direction: -1 | 1): ReadonlyArray<T> {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const current = next[index];
  const other = next[target];
  if (current === undefined || other === undefined) return items;
  next[index] = other;
  next[target] = current;
  return next;
}

export function RallyEditor({ locale, onLocaleChange }: RallyEditorProps) {
  const messages = getMessages(locale);
  const [config, setConfig] = useState<RallyConfig>(() =>
    loadStoredRallyConfig(DRAFT_CONFIG_KEY, DEFAULT_RALLY_CONFIG),
  );
  const [json, setJson] = useState(() => serializeRallyConfig(config));
  const [notice, setNotice] = useState<string | null>(null);
  const [showQrExport, setShowQrExport] = useState(false);
  const validation = useMemo(() => parseRallyConfig(normalizeRallyConfig(config)), [config]);
  const previewState = useMemo(
    () => ({ rallyId: config.id, records: [], updatedAt: "" }),
    [config.id],
  );

  useEffect(() => {
    saveStoredRallyConfig(DRAFT_CONFIG_KEY, config);
  }, [config]);

  const updateSpot = (index: number, spot: SpotItem) =>
    setConfig((current) => ({
      ...current,
      stamps: current.stamps.map((item, itemIndex) => (itemIndex === index ? spot : item)),
    }));

  function addSpot(): void {
    setConfig((current) => {
      const id = uniqueId(
        "spot",
        current.stamps.map((spot) => spot.id),
      );
      const spot: SpotItem = {
        id,
        name: { ja: "新しいスポット", en: "New spot" },
        description: { ja: "", en: "" },
        hint: { ja: "", en: "" },
        order: current.stamps.length + 1,
        condition: { type: "instant" },
      };
      return { ...current, stamps: [...current.stamps, spot] };
    });
  }

  function addReward(): void {
    setConfig((current) => {
      const rewards = current.rewards ?? [];
      const id = uniqueId(
        "reward",
        rewards.map((reward) => reward.id),
      );
      const reward: RewardItem = {
        id,
        title: { ja: "新しい特典", en: "New reward" },
        description: { ja: "特典の説明", en: "Reward description" },
        type: "in_person",
        redemptionMethod: "manual_slide",
        requiredStampCount: 1,
      };
      return { ...current, rewards: [...rewards, reward] };
    });
  }

  function importJson(source = json): void {
    const parsed = parseRallyConfigJson(source);
    if (!parsed.ok) {
      setNotice(`${messages.invalidJson} ${parsed.errors.join(" ")}`);
      return;
    }
    setConfig(parsed.config);
    setJson(serializeRallyConfig(parsed.config));
    setNotice(null);
  }

  async function importFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    const source = await file.text();
    setJson(source);
    importJson(source);
  }

  async function copyJson(): Promise<void> {
    const source = serializeRallyConfig(config);
    setJson(source);
    try {
      await navigator.clipboard.writeText(source);
      setNotice(messages.jsonCopied);
    } catch {
      setNotice(messages.invalidJson);
    }
  }

  function downloadJson(): void {
    const source = serializeRallyConfig(config);
    setJson(source);
    const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${config.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function publish(): void {
    if (!validation.ok) {
      setNotice(`${messages.requiredJapanese} ${validation.errors.join(" ")}`);
      return;
    }
    if (!saveStoredRallyConfig(PUBLISHED_CONFIG_KEY, validation.config)) {
      setNotice(messages.errorStorage);
      return;
    }
    setConfig(validation.config);
    setJson(serializeRallyConfig(validation.config));
    setNotice(messages.published);
  }

  return (
    <main className="page-shell admin-shell">
      <header className="admin-hero">
        <div>
          <p className="eyebrow">@stamprally/core · i18n authoring</p>
          <h1>{messages.adminTitle}</h1>
          <p className="description">{messages.adminDescription}</p>
        </div>
        <div className="admin-hero__actions">
          <LanguageSelector locale={locale} onChange={onLocaleChange} />
          <a className="secondary-button" href="?view=participant">
            {messages.participant}
          </a>
          <button className="secondary-button" type="button" onClick={() => setShowQrExport(true)}>
            {messages.printPop}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!validation.ok}
            onClick={publish}
          >
            {messages.publish}
          </button>
        </div>
      </header>

      {notice !== null && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {!validation.ok && (
        <ul className="admin-errors">
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <div className="admin-layout">
        <div className="admin-forms">
          <GeneralSettingsForm config={config} locale={locale} onChange={setConfig} />
          <ThemeEditor
            theme={config.theme}
            locale={locale}
            onChange={(theme) => setConfig((current) => ({ ...current, theme }))}
          />
          <section className="admin-section">
            <div className="admin-section__heading">
              <h2>{messages.spots}</h2>
              <button className="primary-button" type="button" onClick={addSpot}>
                {messages.addSpot}
              </button>
            </div>
            {config.stamps.map((spot, index) => (
              <SpotItemForm
                key={spot.id}
                spot={spot}
                index={index}
                count={config.stamps.length}
                locale={locale}
                onChange={(next) => updateSpot(index, next)}
                onDelete={() =>
                  setConfig((current) => ({
                    ...current,
                    stamps: current.stamps.filter((_, itemIndex) => itemIndex !== index),
                  }))
                }
                onMove={(direction) =>
                  setConfig((current) => ({
                    ...current,
                    stamps: moveItem(current.stamps, index, direction),
                  }))
                }
              />
            ))}
          </section>
          <RewardListEditor
            rewards={config.rewards ?? []}
            locale={locale}
            onChange={(rewards) => setConfig((current) => ({ ...current, rewards }))}
            onAdd={addReward}
          />
          <section className="admin-card json-editor">
            <h2>{messages.jsonTitle}</h2>
            <textarea
              aria-label={messages.jsonTitle}
              value={json}
              onChange={(event) => setJson(event.target.value)}
            />
            <div className="button-row">
              <button type="button" className="primary-button" onClick={() => importJson()}>
                {messages.importJson}
              </button>
              <label className="secondary-button file-button">
                {messages.importFile}
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => void importFile(event.target.files?.[0])}
                />
              </label>
              <button type="button" className="secondary-button" onClick={() => void copyJson()}>
                {messages.copyJson}
              </button>
              <button type="button" className="secondary-button" onClick={downloadJson}>
                {messages.downloadJson}
              </button>
            </div>
          </section>
        </div>

        <aside className="admin-preview">
          <h2>{messages.preview}</h2>
          <StampSheet
            title={config.title ?? config.id}
            config={config}
            state={previewState}
            progress={calculateProgress(previewState, config)}
            presentations={{}}
            animatedStampId={null}
            disabled={false}
            locale={locale}
            onStampSelect={() => undefined}
          />
        </aside>
      </div>
      <QrExportModal
        open={showQrExport}
        config={config}
        locale={locale}
        onClose={() => setShowQrExport(false)}
      />
    </main>
  );
}
