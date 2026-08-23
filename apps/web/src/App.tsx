import {
  type ConditionMismatch,
  calculateDistanceMeters,
  calculateProgress,
  getCurrentGeoContext,
  isGeolocationSupported,
  LocalStorageAdapter,
  type RallyConfig,
  type RewardConsumeError,
  resolveLocalizedText,
  type StampError,
  StampRallyClient,
  type SupportedLocale,
  type VerificationContext,
} from "@stamprally/core";
import { useStampRally } from "@stamprally/react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RallyEditor } from "./components/admin/RallyEditor.js";
import { LanguageSelector } from "./components/LanguageSelector.js";
import { RewardPanel } from "./components/RewardPanel.js";
import { type AcquisitionFeedback, StampModal } from "./components/StampModal.js";
import { StampSheet } from "./components/StampSheet.js";
import type { StampPresentation } from "./components/StampSlot.js";
import { loadStoredRallyConfig, PUBLISHED_CONFIG_KEY } from "./configIO.js";
import { DEFAULT_PRESENTATIONS, DEFAULT_RALLY_CONFIG } from "./demoConfig.js";
import { detectInitialLocale, getMessages, persistLocale } from "./locales/index.js";

const storage = new LocalStorageAdapter();
type RallyMode = "sequential" | "free";
type Toast = { readonly kind: "error" | "success"; readonly message: string };

function findGeoMismatch(
  mismatch: ConditionMismatch,
): Extract<ConditionMismatch, { reason: "OUTSIDE_RADIUS" }> | null {
  if (mismatch.reason === "OUTSIDE_RADIUS") return mismatch;
  if (mismatch.conditionType !== "composite" || !("failures" in mismatch)) return null;
  for (const failure of mismatch.failures) {
    const nested = findGeoMismatch(failure.error);
    if (nested !== null) return nested;
  }
  return null;
}

function fallbackPresentation(
  condition: RallyConfig["stamps"][number]["condition"],
  index = 0,
): StampPresentation {
  const ink = index % 2 === 0 ? "vermilion" : "indigo";
  switch (condition.type) {
    case "instant":
      return { channel: "instant", label: "Instant", icon: "⚡", ink };
    case "token":
      return { channel: "qr", label: "Token", icon: "🔑", ink };
    case "geo":
      return { channel: "geo", label: "GPS", icon: "📍", ink };
    default:
      return { channel: "instant", label: "Special", icon: "✦", ink };
  }
}

interface ParticipantAppProps {
  readonly locale: SupportedLocale;
  readonly onLocaleChange: (locale: SupportedLocale) => void;
}

function ParticipantApp({ locale, onLocaleChange }: ParticipantAppProps) {
  const messages = getMessages(locale);
  const [baseConfig] = useState<RallyConfig>(() =>
    loadStoredRallyConfig(PUBLISHED_CONFIG_KEY, DEFAULT_RALLY_CONFIG),
  );
  const [mode, setMode] = useState<RallyMode>(
    baseConfig.isSequential === false ? "free" : "sequential",
  );
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [animatedStampId, setAnimatedStampId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [token, setToken] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = useMemo<RallyConfig>(
    () => ({ ...baseConfig, isSequential: mode === "sequential" }),
    [baseConfig, mode],
  );
  const client = useMemo(() => new StampRallyClient(config, storage), [config]);
  const { state, rewardsState, isLoading, isPending, error, acquire, reset, redeem } =
    useStampRally(client);
  const progress = calculateProgress(
    state ?? { rallyId: config.id, records: [], updatedAt: "" },
    config,
  );
  const recordsById = new Map(state?.records.map((record) => [record.stampId, record]) ?? []);
  const nextAvailableIds = new Set(progress.nextAvailableStamps.map((stamp) => stamp.id));
  const selectedStamp =
    selectedStampId === null
      ? null
      : (config.stamps.find((stamp) => stamp.id === selectedStampId) ?? null);
  const selectedRecord = selectedStampId === null ? undefined : recordsById.get(selectedStampId);
  const selectedIndex = selectedStamp === null ? -1 : config.stamps.indexOf(selectedStamp);
  const selectedPresentation =
    selectedStamp === null
      ? null
      : (DEFAULT_PRESENTATIONS[selectedStamp.id] ??
        fallbackPresentation(selectedStamp.condition, selectedIndex));
  const selectedAvailable =
    selectedStampId !== null &&
    (selectedRecord !== undefined || nextAvailableIds.has(selectedStampId));
  const controlsDisabled = isLoading || isPending || selectedStampId !== null;
  const instantSpot = config.stamps.find((stamp) => stamp.condition.type === "instant");
  const tokenSpot = config.stamps.find((stamp) => stamp.condition.type === "token");
  const geoSpot = config.stamps.find((stamp) => stamp.condition.type === "geo");
  const geoCondition = geoSpot?.condition.type === "geo" ? geoSpot.condition : null;
  const latitudeValue = Number(latitude);
  const longitudeValue = Number(longitude);
  const distance =
    geoCondition !== null && Number.isFinite(latitudeValue) && Number.isFinite(longitudeValue)
      ? calculateDistanceMeters(
          geoCondition.latitude,
          geoCondition.longitude,
          latitudeValue,
          longitudeValue,
        )
      : null;

  const describeError = useCallback(
    (value: StampError | RewardConsumeError | Error): string => {
      if (value instanceof Error) return value.message;
      switch (value.code) {
        case "STAMP_NOT_FOUND":
          return messages.errorStampNotFound;
        case "STAMP_ALREADY_ACQUIRED":
          return messages.errorDuplicate;
        case "INVALID_ORDER": {
          const expected = config.stamps.find((stamp) => stamp.id === value.expectedStampId);
          return messages.errorOrder(
            resolveLocalizedText(expected?.name, locale) || value.expectedStampId,
          );
        }
        case "CONDITION_MISMATCH": {
          const mismatch = findGeoMismatch(value.mismatch);
          if (mismatch !== null) {
            return messages.errorDistance(Math.ceil(mismatch.differenceMeters));
          }
          if (value.mismatch.conditionType === "token") return messages.errorToken;
          if (value.mismatch.conditionType === "time_window") return messages.errorTime;
          return messages.errorCondition;
        }
        case "NOT_AVAILABLE":
          return messages.errorNotAvailable;
        case "ALREADY_CONSUMED":
          return messages.errorConsumed;
        case "INVALID_PASSCODE":
          return messages.errorPasscode;
        case "REWARD_NOT_FOUND":
          return messages.errorRewardNotFound;
      }
    },
    [config.stamps, locale, messages],
  );

  useEffect(() => {
    if (error !== null) setToast({ kind: "error", message: describeError(error) });
  }, [error, describeError]);

  useEffect(
    () => () => {
      if (animationTimer.current !== null) clearTimeout(animationTimer.current);
    },
    [],
  );

  async function tryAcquire(
    stampId: string,
    context: VerificationContext,
  ): Promise<AcquisitionFeedback> {
    const shouldAnimate = !recordsById.has(stampId);
    if (shouldAnimate) setAnimatedStampId(stampId);
    try {
      const result = await acquire(stampId, context);
      if (!result.ok) {
        setAnimatedStampId(null);
        const message = describeError(result.error);
        setToast({ kind: "error", message });
        return { ok: false, message };
      }
      const stamp = config.stamps.find((item) => item.id === stampId);
      const message = messages.acquiredMessage(
        resolveLocalizedText(stamp?.name, locale) || stampId,
      );
      setToast({ kind: "success", message });
      if (shouldAnimate) {
        animationTimer.current = setTimeout(() => setAnimatedStampId(null), 900);
      }
      return { ok: true, message };
    } catch (cause) {
      setAnimatedStampId(null);
      const message = describeError(cause instanceof Error ? cause : new Error(String(cause)));
      setToast({ kind: "error", message });
      return { ok: false, message };
    }
  }

  async function submitToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (tokenSpot === undefined || token.trim() === "") {
      setToast({ kind: "error", message: messages.tokenRequired });
      return;
    }
    await tryAcquire(tokenSpot.id, { type: "token", token: token.trim() });
  }

  async function locate(): Promise<void> {
    if (geoSpot === undefined) return;
    const result = await getCurrentGeoContext({ enableHighAccuracy: true, timeout: 10_000 });
    if (!result.ok) {
      setToast({ kind: "error", message: messages.errorPermission });
      return;
    }
    setLatitude(String(result.value.currentLatitude));
    setLongitude(String(result.value.currentLongitude));
    await tryAcquire(geoSpot.id, result.value);
  }

  async function clearState(): Promise<void> {
    try {
      await reset();
      setSelectedStampId(null);
      setAnimatedStampId(null);
      setToast({ kind: "success", message: messages.resetSuccess });
    } catch (cause) {
      setToast({
        kind: "error",
        message: describeError(cause instanceof Error ? cause : new Error(String(cause))),
      });
    }
  }

  return (
    <main className="page-shell" aria-busy={isLoading || isPending}>
      <section className="demo-panel">
        <header className="hero">
          <div>
            <p className="eyebrow">@stamprally/core · collection field lab</p>
            <h1>{messages.heroTitle}</h1>
            <p className="description">
              {resolveLocalizedText(config.description, locale) || messages.heroDescription}
            </p>
          </div>
          <div className="hero-actions">
            <LanguageSelector locale={locale} onChange={onLocaleChange} />
            <a className="secondary-button" href="?view=admin">
              {messages.admin}
            </a>
            <button
              className="secondary-button danger-button"
              type="button"
              disabled={controlsDisabled}
              onClick={() => void clearState()}
            >
              {messages.reset}
            </button>
          </div>
        </header>

        <section className="control-bar" aria-label={messages.routeMode}>
          <div>
            <span className="control-label">{messages.routeMode}</span>
            <div className="mode-toggle" role="radiogroup" aria-label={messages.routeMode}>
              {(["sequential", "free"] as const).map((value) => (
                <label key={value} className={mode === value ? "active" : ""}>
                  <input
                    type="radio"
                    name="rally-mode"
                    value={value}
                    checked={mode === value}
                    disabled={controlsDisabled}
                    onChange={() => setMode(value)}
                  />
                  <span>{value === "sequential" ? messages.sequential : messages.free}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="next-stamp">
            <span className="control-label">{messages.nextAvailable}</span>
            <strong>
              {progress.nextAvailableStamps
                .map((stamp) => resolveLocalizedText(stamp.name, locale))
                .join(" / ") || messages.completed}
            </strong>
          </div>
        </section>

        <StampSheet
          title={config.title ?? config.id}
          config={config}
          state={state}
          progress={progress}
          presentations={DEFAULT_PRESENTATIONS}
          animatedStampId={animatedStampId}
          disabled={isLoading || isPending}
          locale={locale}
          onStampSelect={setSelectedStampId}
        />

        <section className="quick-lab" aria-labelledby="quick-lab-title">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Sensors</p>
              <h2 id="quick-lab-title">{messages.quickLab}</h2>
            </div>
            <p>{messages.quickLabDescription}</p>
          </header>
          {isLoading ? (
            <p className="loading-message">{messages.loading}</p>
          ) : (
            <div className="spot-grid">
              {instantSpot !== undefined && (
                <article className="spot-card">
                  <h3>{resolveLocalizedText(instantSpot.name, locale)}</h3>
                  <p>{resolveLocalizedText(instantSpot.description, locale)}</p>
                  <button
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => void tryAcquire(instantSpot.id, { type: "instant" })}
                  >
                    {messages.instantAction}
                  </button>
                </article>
              )}
              {tokenSpot !== undefined && (
                <article className="spot-card">
                  <h3>{resolveLocalizedText(tokenSpot.name, locale)}</h3>
                  <form className="token-form" onSubmit={(event) => void submitToken(event)}>
                    <label>
                      {messages.tokenInput}
                      <input
                        value={token}
                        placeholder={messages.tokenPlaceholder}
                        onChange={(event) => setToken(event.target.value)}
                      />
                    </label>
                    <div className="button-row">
                      <button type="submit" disabled={controlsDisabled}>
                        {messages.submitToken}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={controlsDisabled}
                        onClick={() => {
                          if (tokenSpot.condition.type === "token") {
                            setToken(tokenSpot.condition.token);
                            void tryAcquire(tokenSpot.id, {
                              type: "token",
                              token: tokenSpot.condition.token,
                            });
                          }
                        }}
                      >
                        {messages.simulateToken}
                      </button>
                    </div>
                  </form>
                </article>
              )}
              {geoSpot !== undefined && geoCondition !== null && (
                <article className="spot-card geo-card">
                  <h3>{resolveLocalizedText(geoSpot.name, locale)}</h3>
                  <div className="coordinate-grid">
                    <label>
                      {messages.latitude}
                      <input
                        type="number"
                        value={latitude}
                        onChange={(event) => setLatitude(event.target.value)}
                      />
                    </label>
                    <label>
                      {messages.longitude}
                      <input
                        type="number"
                        value={longitude}
                        onChange={(event) => setLongitude(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={controlsDisabled || !isGeolocationSupported()}
                      onClick={() => void locate()}
                    >
                      {messages.locationAction}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => {
                        setLatitude(String(geoCondition.latitude));
                        setLongitude(String(geoCondition.longitude));
                      }}
                    >
                      {messages.successPreset}
                    </button>
                    <button
                      type="button"
                      disabled={
                        controlsDisabled ||
                        !Number.isFinite(latitudeValue) ||
                        !Number.isFinite(longitudeValue)
                      }
                      onClick={() =>
                        void tryAcquire(geoSpot.id, {
                          type: "geo",
                          currentLatitude: latitudeValue,
                          currentLongitude: longitudeValue,
                        })
                      }
                    >
                      {messages.coordinatesAction}
                    </button>
                  </div>
                  <p className="distance-readout">
                    {distance === null
                      ? messages.invalidCoordinates
                      : messages.distance(Math.round(distance))}
                  </p>
                </article>
              )}
            </div>
          )}
        </section>

        <RewardPanel
          rewards={config.rewards ?? []}
          states={rewardsState}
          locale={locale}
          isPending={isPending}
          isCompleted={progress.isCompleted}
          onRedeem={redeem}
          onNotify={(ok, message) => setToast({ kind: ok ? "success" : "error", message })}
        />
        <footer>{messages.savedProgress}</footer>
      </section>

      <StampModal
        key={selectedStampId ?? "closed"}
        open={selectedStamp !== null}
        stamp={selectedStamp}
        record={selectedRecord}
        presentation={selectedPresentation}
        isAvailable={selectedAvailable}
        requiredStampName={
          resolveLocalizedText(progress.nextAvailableStamps[0]?.name, locale) || null
        }
        isPending={isPending}
        locale={locale}
        onClose={() => setSelectedStampId(null)}
        onAcquire={tryAcquire}
        onNotify={(feedback) =>
          setToast({ kind: feedback.ok ? "success" : "error", message: feedback.message })
        }
      />

      {toast !== null && (
        <div className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label={messages.notificationClose}
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

export function App() {
  const [locale, setLocale] = useState<SupportedLocale>(detectInitialLocale);
  useEffect(() => {
    persistLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);
  const isAdmin = new URLSearchParams(globalThis.location?.search ?? "").get("view") === "admin";
  return isAdmin ? (
    <RallyEditor locale={locale} onLocaleChange={setLocale} />
  ) : (
    <ParticipantApp locale={locale} onLocaleChange={setLocale} />
  );
}
