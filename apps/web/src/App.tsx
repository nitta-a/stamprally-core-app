import {
  type ConditionMismatch,
  calculateDistanceMeters,
  calculateProgress,
  type DetectorError,
  getCurrentGeoContext,
  isGeolocationSupported,
  isQrSupported,
  LocalStorageAdapter,
  type RallyConfig,
  type RewardConsumeError,
  readQrContext,
  type StampError,
  StampRallyClient,
  StorageAdapterError,
  type VerificationContext,
} from "@stamprally/core";
import { useStampRally } from "@stamprally/react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { type AcquisitionFeedback, StampModal } from "./components/StampModal.js";
import { StampSheet } from "./components/StampSheet.js";
import type { StampPresentation } from "./components/StampSlot.js";

const RALLY_TITLE = "TOKYO DISCOVERY STAMP RALLY";
const TOKEN_B = "STAMP-B-2026";
const TOKEN_E = "STAMP-E-2026";
const TOKYO_STATION = {
  latitude: 35.681236,
  longitude: 139.767125,
  radiusMeters: 150,
} as const;
const TOKYO_TOWER = {
  latitude: 35.658581,
  longitude: 139.745433,
  radiusMeters: 180,
} as const;
const NEARBY_PRESET = { latitude: 35.68145, longitude: 139.7672 } as const;
const OUTSIDE_PRESET = { latitude: 35.689592, longitude: 139.700413 } as const;

const stamps: RallyConfig["stamps"] = [
  { id: "spot-a", name: "Welcome Gate", order: 1, condition: { type: "instant" } },
  {
    id: "spot-b",
    name: "Station QR",
    order: 2,
    condition: { type: "token", token: TOKEN_B },
  },
  {
    id: "spot-c",
    name: "Tokyo Station",
    order: 3,
    condition: { type: "geo", ...TOKYO_STATION },
  },
  { id: "spot-d", name: "Museum Check-in", order: 4, condition: { type: "instant" } },
  {
    id: "spot-e",
    name: "NFC Kiosk",
    order: 5,
    condition: { type: "token", token: TOKEN_E },
  },
  {
    id: "spot-f",
    name: "Tokyo Tower",
    order: 6,
    condition: { type: "geo", ...TOKYO_TOWER },
  },
];

const presentations: Readonly<Record<string, StampPresentation>> = {
  "spot-a": { channel: "instant", label: "Instant", icon: "⚡", ink: "vermilion" },
  "spot-b": { channel: "qr", label: "QR Code", icon: "📷", ink: "indigo" },
  "spot-c": { channel: "geo", label: "GPS", icon: "📍", ink: "vermilion" },
  "spot-d": { channel: "instant", label: "Instant", icon: "⚡", ink: "indigo" },
  "spot-e": { channel: "nfc", label: "Web NFC", icon: "📳", ink: "vermilion" },
  "spot-f": { channel: "geo", label: "GPS", icon: "📍", ink: "indigo" },
};

const storage = new LocalStorageAdapter();

type RallyMode = "sequential" | "free";
type Toast = { readonly kind: "error" | "success"; readonly message: string };
type QuickDetector = "geolocation" | "qr";

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

function describeError(
  error: StampError | RewardConsumeError | Error,
  config: RallyConfig,
): string {
  if (error instanceof StorageAdapterError) {
    if (error.code === "STORAGE_UNAVAILABLE") {
      return "ブラウザストレージを利用できません。メモリ上で操作を継続します。";
    }
    if (error.code === "STORAGE_INVALID_DATA") {
      return "保存データが破損しています。Resetで状態を削除してください。";
    }
    return "状態の保存または読み込みに失敗しました。";
  }
  if (error instanceof Error) return error.message;
  switch (error.code) {
    case "STAMP_NOT_FOUND":
      return "対象のスタンプが見つかりません。";
    case "STAMP_ALREADY_ACQUIRED":
      return "このスタンプはすでに取得済みです。";
    case "INVALID_ORDER": {
      const expected = config.stamps.find((stamp) => stamp.id === error.expectedStampId);
      return `順序が違います。先に「${expected?.name ?? error.expectedStampId}」を取得してください。`;
    }
    case "CONDITION_MISMATCH": {
      const geoMismatch = findGeoMismatch(error.mismatch);
      if (geoMismatch !== null) {
        return `対象地点まであと約${Math.ceil(geoMismatch.differenceMeters)}mです。`;
      }
      if (error.mismatch.conditionType === "token") return "トークンが一致しません。";
      if (error.mismatch.conditionType === "time_window") {
        return "現在時刻は取得可能な時間枠の外です。";
      }
      return "スタンプの取得条件を満たしていません。";
    }
    case "NOT_AVAILABLE":
      return "この特典はまだ利用できません。";
    case "ALREADY_CONSUMED":
      return "この特典はすでに利用済みです。";
    case "INVALID_PASSCODE":
      return "スタッフ用合言葉が一致しません。";
    case "REWARD_NOT_FOUND":
      return "対象の特典が見つかりません。";
  }
}

function describeDetectorError(error: DetectorError): string {
  switch (error.code) {
    case "UNSUPPORTED":
      return error.detector === "qr"
        ? "このブラウザはライブQR読取に対応していません。模擬ボタンをご利用ください。"
        : "このブラウザは位置情報取得に対応していません。";
    case "PERMISSION_DENIED":
      return "センサーの利用が拒否されました。ブラウザの権限設定を確認してください。";
    case "POSITION_UNAVAILABLE":
      return "現在地を取得できませんでした。プリセット座標をご利用ください。";
    case "TIMEOUT":
      return "センサーの待機時間を超えました。";
    case "ABORTED":
      return "センサーの読み取りをキャンセルしました。";
    case "NO_TOKEN":
      return "読み取り可能なトークンがありません。";
    case "INVALID_DATA":
      return "センサーから無効なデータが返されました。";
    case "READ_FAILED":
      return "センサーの読み取りに失敗しました。";
  }
}

export function App() {
  const [mode, setMode] = useState<RallyMode>("sequential");
  const [token, setToken] = useState("");
  const [latitude, setLatitude] = useState(String(OUTSIDE_PRESET.latitude));
  const [longitude, setLongitude] = useState(String(OUTSIDE_PRESET.longitude));
  const [activeDetector, setActiveDetector] = useState<QuickDetector | null>(null);
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [animatedStampId, setAnimatedStampId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const detectorController = useRef<AbortController | null>(null);
  const qrVideo = useRef<HTMLVideoElement | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = useMemo<RallyConfig>(
    () => ({ id: "stamp-sheet-demo-v1", stamps, isSequential: mode === "sequential" }),
    [mode],
  );
  const client = useMemo(() => new StampRallyClient(config, storage), [config]);
  const { state, isLoading, isPending, error, acquire, reset } = useStampRally(client);
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
  const selectedPresentation =
    selectedStampId === null ? null : (presentations[selectedStampId] ?? null);
  const selectedAvailable =
    selectedStampId !== null &&
    (selectedRecord !== undefined || nextAvailableIds.has(selectedStampId));
  const isQuickBusy = isLoading || isPending || activeDetector !== null;
  const controlsDisabled = isQuickBusy || selectedStampId !== null;
  const currentLatitude = Number(latitude);
  const currentLongitude = Number(longitude);
  const currentDistance =
    Number.isFinite(currentLatitude) && Number.isFinite(currentLongitude)
      ? calculateDistanceMeters(
          TOKYO_STATION.latitude,
          TOKYO_STATION.longitude,
          currentLatitude,
          currentLongitude,
        )
      : null;

  useEffect(() => {
    if (error !== null) setToast({ kind: "error", message: describeError(error, config) });
  }, [config, error]);

  useEffect(
    () => () => {
      detectorController.current?.abort();
      if (animationTimer.current !== null) clearTimeout(animationTimer.current);
    },
    [],
  );

  function scheduleAnimationEnd(): void {
    if (animationTimer.current !== null) clearTimeout(animationTimer.current);
    animationTimer.current = setTimeout(() => {
      setAnimatedStampId(null);
      animationTimer.current = null;
    }, 900);
  }

  async function tryAcquire(
    stampId: string,
    context: VerificationContext,
  ): Promise<AcquisitionFeedback> {
    const shouldAnimate = !recordsById.has(stampId);
    if (shouldAnimate) setAnimatedStampId(stampId);
    try {
      const result = await acquire(stampId, context);
      if (!result.ok) {
        if (shouldAnimate) setAnimatedStampId(null);
        const message = describeError(result.error, config);
        setToast({ kind: "error", message });
        return { ok: false, message };
      }
      const stamp = config.stamps.find((item) => item.id === stampId);
      const message = `${stamp?.name ?? stampId}を取得しました。`;
      setToast({ kind: "success", message });
      if (shouldAnimate) scheduleAnimationEnd();
      return { ok: true, message };
    } catch (acquireError) {
      if (shouldAnimate) setAnimatedStampId(null);
      const normalized =
        acquireError instanceof Error ? acquireError : new Error(String(acquireError));
      const message = describeError(normalized, config);
      setToast({ kind: "error", message });
      return { ok: false, message };
    }
  }

  async function handleTokenSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (token.trim() === "") {
      setToast({ kind: "error", message: "QRトークンを入力してください。" });
      return;
    }
    const result = await tryAcquire("spot-b", { type: "token", token: token.trim() });
    if (result.ok) setToken("");
  }

  async function acquireGeoStamp(): Promise<void> {
    if (!Number.isFinite(currentLatitude) || !Number.isFinite(currentLongitude)) {
      setToast({ kind: "error", message: "有効な緯度と経度を入力してください。" });
      return;
    }
    await tryAcquire("spot-c", { type: "geo", currentLatitude, currentLongitude });
  }

  function applyPreset(preset: { readonly latitude: number; readonly longitude: number }): void {
    setLatitude(String(preset.latitude));
    setLongitude(String(preset.longitude));
    setToast(null);
  }

  function beginDetector(kind: QuickDetector): AbortController | null {
    if (detectorController.current !== null) return null;
    const controller = new AbortController();
    detectorController.current = controller;
    setActiveDetector(kind);
    setToast(null);
    return controller;
  }

  function finishDetector(controller: AbortController): void {
    if (detectorController.current !== controller) return;
    detectorController.current = null;
    setActiveDetector(null);
  }

  async function requestCurrentLocation(): Promise<void> {
    const controller = beginDetector("geolocation");
    if (controller === null) return;
    try {
      const result = await getCurrentGeoContext({ enableHighAccuracy: true, timeout: 10_000 });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setToast({ kind: "error", message: describeDetectorError(result.error) });
        return;
      }
      setLatitude(result.value.currentLatitude.toFixed(6));
      setLongitude(result.value.currentLongitude.toFixed(6));
      await tryAcquire("spot-c", result.value);
    } finally {
      finishDetector(controller);
    }
  }

  async function scanQr(): Promise<void> {
    const controller = beginDetector("qr");
    if (controller === null) return;
    const video = qrVideo.current;
    if (video === null) {
      finishDetector(controller);
      setToast({ kind: "error", message: "QRプレビューを初期化できませんでした。" });
      return;
    }
    try {
      const result = await readQrContext(video, { signal: controller.signal });
      if (!result.ok) {
        setToast({ kind: "error", message: describeDetectorError(result.error) });
        return;
      }
      setToken(result.value.token);
      await tryAcquire("spot-b", result.value);
    } finally {
      finishDetector(controller);
    }
  }

  function cancelDetector(): void {
    detectorController.current?.abort();
  }

  async function clearState(): Promise<void> {
    try {
      await reset();
      if (animationTimer.current !== null) clearTimeout(animationTimer.current);
      animationTimer.current = null;
      setAnimatedStampId(null);
      setSelectedStampId(null);
      setToken("");
      setLatitude(String(OUTSIDE_PRESET.latitude));
      setLongitude(String(OUTSIDE_PRESET.longitude));
      setToast({ kind: "success", message: "保存済みの進捗を削除しました。" });
    } catch (resetError) {
      const normalized = resetError instanceof Error ? resetError : new Error(String(resetError));
      setToast({ kind: "error", message: describeError(normalized, config) });
    }
  }

  function statusFor(stampId: string): string {
    if (recordsById.has(stampId)) return "取得済み";
    if (nextAvailableIds.has(stampId)) return "取得可能";
    return mode === "sequential" ? "順序待ち" : "取得可能";
  }

  return (
    <main className="page-shell" aria-busy={isQuickBusy}>
      <section className="demo-panel">
        <header className="hero">
          <div>
            <p className="eyebrow">@stamprally/core · collection field lab</p>
            <h1>Collect the city.</h1>
            <p className="description">
              6つのチェックポイントを巡り、紙の台紙へスタンプを集める実動デモです。
            </p>
          </div>
          <button
            className="secondary-button danger-button"
            type="button"
            onClick={() => void clearState()}
            disabled={controlsDisabled}
          >
            Reset Sheet
          </button>
        </header>

        <section className="control-bar" aria-label="ラリー設定">
          <div>
            <span className="control-label">Route mode</span>
            <div className="mode-toggle" role="radiogroup" aria-label="ルートモード">
              <label className={mode === "sequential" ? "active" : ""}>
                <input
                  type="radio"
                  name="rally-mode"
                  value="sequential"
                  checked={mode === "sequential"}
                  onChange={() => setMode("sequential")}
                  disabled={controlsDisabled}
                />
                <span>Sequential</span>
              </label>
              <label className={mode === "free" ? "active" : ""}>
                <input
                  type="radio"
                  name="rally-mode"
                  value="free"
                  checked={mode === "free"}
                  onChange={() => setMode("free")}
                  disabled={controlsDisabled}
                />
                <span>Free</span>
              </label>
            </div>
          </div>
          <div className="next-stamp">
            <span className="control-label">Next available</span>
            <strong>
              {progress.nextAvailableStamps.map((stamp) => stamp.name).join(" / ") || "Completed"}
            </strong>
          </div>
        </section>

        <StampSheet
          title={RALLY_TITLE}
          config={config}
          state={state}
          progress={progress}
          presentations={presentations}
          animatedStampId={animatedStampId}
          disabled={isQuickBusy}
          onStampSelect={setSelectedStampId}
        />

        <section className="quick-lab" aria-labelledby="quick-lab-title">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Representative sensor checks</p>
              <h2 id="quick-lab-title">Quick Lab</h2>
            </div>
            <p>#01 Instant、#02 QR、#03 GPSを台紙を開かずに検証できます。</p>
          </header>

          {isLoading ? (
            <p className="loading-message" role="status">
              保存済みの進捗を読み込んでいます…
            </p>
          ) : (
            <div className="spot-grid">
              <article className="spot-card">
                <div className="spot-heading">
                  <span className="spot-index">01</span>
                  <div>
                    <h3>Welcome Gate</h3>
                    <p>Instant</p>
                  </div>
                  <span className={`status-badge ${recordsById.has("spot-a") ? "done" : ""}`}>
                    {statusFor("spot-a")}
                  </span>
                </div>
                <p className="spot-copy">クリックだけで即時条件を検証します。</p>
                <button
                  type="button"
                  onClick={() => void tryAcquire("spot-a", { type: "instant" })}
                  disabled={controlsDisabled}
                >
                  {isPending ? "処理中…" : "Instantで押印"}
                </button>
              </article>

              <article className="spot-card">
                <div className="spot-heading">
                  <span className="spot-index">02</span>
                  <div>
                    <h3>Station QR</h3>
                    <p>QR / Token</p>
                  </div>
                  <span className={`status-badge ${recordsById.has("spot-b") ? "done" : ""}`}>
                    {statusFor("spot-b")}
                  </span>
                </div>
                <form onSubmit={handleTokenSubmit} className="token-form">
                  <label htmlFor="quick-token">Scanned token</label>
                  <input
                    id="quick-token"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="QRトークンを入力"
                    autoComplete="off"
                  />
                  <div className="button-row">
                    <button type="submit" disabled={controlsDisabled}>
                      入力値で押印
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => {
                        setToken(TOKEN_B);
                        void tryAcquire("spot-b", { type: "token", token: TOKEN_B });
                      }}
                    >
                      正解QRを模擬
                    </button>
                  </div>
                </form>
                <div className="detector-block">
                  <div className="detector-heading">
                    <strong>Live QR camera</strong>
                    <span className={`support-badge ${isQrSupported() ? "supported" : ""}`}>
                      {isQrSupported() ? "対応" : "非対応"}
                    </span>
                  </div>
                  {/* biome-ignore lint/a11y/useMediaCaption: The muted QR camera preview has no audio content. */}
                  <video
                    ref={qrVideo}
                    className={`qr-preview ${activeDetector === "qr" ? "active" : ""}`}
                    aria-label="Quick Lab QRカメラプレビュー"
                  />
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={controlsDisabled || !isQrSupported()}
                      onClick={() => void scanQr()}
                    >
                      {activeDetector === "qr" ? "QR待機中…" : "ライブQRをスキャン"}
                    </button>
                    {activeDetector === "qr" && (
                      <button
                        className="secondary-button cancel-button"
                        type="button"
                        onClick={cancelDetector}
                      >
                        キャンセル
                      </button>
                    )}
                  </div>
                </div>
              </article>

              <article className="spot-card geo-card">
                <div className="spot-heading">
                  <span className="spot-index">03</span>
                  <div>
                    <h3>Tokyo Station</h3>
                    <p>GPS · 半径{TOKYO_STATION.radiusMeters}m</p>
                  </div>
                  <span className={`status-badge ${recordsById.has("spot-c") ? "done" : ""}`}>
                    {statusFor("spot-c")}
                  </span>
                </div>
                <div className="coordinate-grid">
                  <label htmlFor="quick-latitude">
                    Latitude
                    <input
                      id="quick-latitude"
                      type="number"
                      step="0.000001"
                      value={latitude}
                      onChange={(event) => setLatitude(event.target.value)}
                    />
                  </label>
                  <label htmlFor="quick-longitude">
                    Longitude
                    <input
                      id="quick-longitude"
                      type="number"
                      step="0.000001"
                      value={longitude}
                      onChange={(event) => setLongitude(event.target.value)}
                    />
                  </label>
                </div>
                <div className="preset-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void requestCurrentLocation()}
                    disabled={controlsDisabled || !isGeolocationSupported()}
                  >
                    {activeDetector === "geolocation" ? "GPS取得中…" : "現在地を取得して押印"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => applyPreset(NEARBY_PRESET)}
                  >
                    成功プリセット
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => applyPreset(OUTSIDE_PRESET)}
                  >
                    圏外プリセット
                  </button>
                </div>
                <p className="distance-readout" aria-live="polite">
                  {currentDistance === null
                    ? "有効な座標を入力してください。"
                    : `現在座標: ${currentLatitude.toFixed(6)}, ${currentLongitude.toFixed(6)} · 目標まで約${Math.round(currentDistance)}m`}
                </p>
                <button
                  type="button"
                  onClick={() => void acquireGeoStamp()}
                  disabled={controlsDisabled}
                >
                  入力座標で押印
                </button>
              </article>
            </div>
          )}
        </section>

        <footer>進捗はLocalStorageへ保存され、再読み込み後も復元されます。</footer>
      </section>

      <StampModal
        key={selectedStampId ?? "closed"}
        open={selectedStamp !== null}
        stamp={selectedStamp}
        record={selectedRecord}
        presentation={selectedPresentation}
        isAvailable={selectedAvailable}
        requiredStampName={progress.nextAvailableStamps[0]?.name ?? null}
        isPending={isPending}
        onClose={() => setSelectedStampId(null)}
        onAcquire={tryAcquire}
        onNotify={(feedback) =>
          setToast({ kind: feedback.ok ? "success" : "error", message: feedback.message })
        }
      />

      {toast !== null && (
        <div className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
          <span>{toast.message}</span>
          <button type="button" aria-label="通知を閉じる" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </main>
  );
}
