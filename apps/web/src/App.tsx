import {
  type ConditionMismatch,
  calculateDistanceMeters,
  calculateProgress,
  type DetectorError,
  getCurrentGeoContext,
  isGeolocationSupported,
  isNfcSupported,
  isQrSupported,
  LocalStorageAdapter,
  type RallyConfig,
  readNfcContext,
  readQrContext,
  type StampError,
  StampRallyClient,
  StorageAdapterError,
  type VerificationContext,
} from "@stamprally/core";
import { useStampRally } from "@stamprally/react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

const DEMO_TOKEN = "STAMP-B-2026";
const SPOT_C = {
  latitude: 35.681236,
  longitude: 139.767125,
  radiusMeters: 150,
} as const;
const NEARBY_PRESET = { latitude: 35.68145, longitude: 139.7672 } as const;
const OUTSIDE_PRESET = { latitude: 35.689592, longitude: 139.700413 } as const;

const stamps: RallyConfig["stamps"] = [
  {
    id: "spot-a",
    name: "Spot A · Instant",
    order: 1,
    condition: { type: "instant" },
  },
  {
    id: "spot-b",
    name: "Spot B · QR Token",
    order: 2,
    condition: { type: "token", token: DEMO_TOKEN },
  },
  {
    id: "spot-c",
    name: "Spot C · Tokyo Station",
    order: 3,
    condition: { type: "geo", ...SPOT_C },
  },
];

const storage = new LocalStorageAdapter();

type RallyMode = "sequential" | "free";
type Toast = { readonly kind: "error" | "success"; readonly message: string };
type ActiveDetector = "geolocation" | "nfc" | "qr";

function describeDetectorError(error: DetectorError): string {
  switch (error.code) {
    case "UNSUPPORTED":
      return error.detector === "nfc"
        ? "この端末はWeb NFCに対応していません。手入力または模擬QRをご利用ください。"
        : error.detector === "qr"
          ? "このブラウザはライブQR読取に対応していません。手入力または模擬QRをご利用ください。"
          : "このブラウザは位置情報取得に対応していません。";
    case "PERMISSION_DENIED":
      return "センサーの利用が拒否されました。ブラウザの権限設定を確認してください。";
    case "POSITION_UNAVAILABLE":
      return "現在地を取得できませんでした。屋外で再試行するかプリセット座標をご利用ください。";
    case "TIMEOUT":
      return "センサーの待機時間を超えました。もう一度お試しください。";
    case "ABORTED":
      return "センサーの読み取りをキャンセルしました。";
    case "NO_TOKEN":
      return "タグに読み取り可能なテキストトークンがありません。";
    case "INVALID_DATA":
      return "センサーから無効なデータが返されました。";
    case "READ_FAILED":
      return "センサーの読み取りに失敗しました。";
  }
}

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

function describeError(error: StampError | Error, config: RallyConfig): string {
  if (error instanceof StorageAdapterError) {
    if (error.code === "STORAGE_UNAVAILABLE") {
      return "ブラウザのストレージを利用できません。プライベートモード設定を確認してください。";
    }
    if (error.code === "STORAGE_INVALID_DATA") {
      return "保存データが破損しています。Clear Stateで状態を削除してください。";
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
        return `距離が足りません。対象地点まであと約${Math.ceil(geoMismatch.differenceMeters)}mです。`;
      }
      if (error.mismatch.conditionType === "token") {
        return "QRトークンが一致しません。";
      }
      if (error.mismatch.conditionType === "time_window") {
        return "現在時刻は取得可能な時間枠の外です。";
      }
      return "スタンプの取得条件を満たしていません。";
    }
  }
}

export function App() {
  const [mode, setMode] = useState<RallyMode>("sequential");
  const [token, setToken] = useState("");
  const [latitude, setLatitude] = useState(String(OUTSIDE_PRESET.latitude));
  const [longitude, setLongitude] = useState(String(OUTSIDE_PRESET.longitude));
  const [activeDetector, setActiveDetector] = useState<ActiveDetector | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const detectorController = useRef<AbortController | null>(null);
  const qrVideo = useRef<HTMLVideoElement | null>(null);

  const config = useMemo<RallyConfig>(
    () => ({
      id: "practical-demo-v1",
      stamps,
      isSequential: mode === "sequential",
    }),
    [mode],
  );
  const client = useMemo(() => new StampRallyClient(config, storage), [config]);
  const { state, isLoading, isPending, error, acquire, reset } = useStampRally(client);
  const progress = calculateProgress(
    state ?? { rallyId: config.id, records: [], updatedAt: "" },
    config,
  );
  const isBusy = isLoading || isPending || activeDetector !== null;
  const currentLatitude = Number(latitude);
  const currentLongitude = Number(longitude);
  const currentDistance =
    Number.isFinite(currentLatitude) && Number.isFinite(currentLongitude)
      ? calculateDistanceMeters(
          SPOT_C.latitude,
          SPOT_C.longitude,
          currentLatitude,
          currentLongitude,
        )
      : null;
  const geolocationSupported = isGeolocationSupported();
  const nfcSupported = isNfcSupported();
  const qrSupported = isQrSupported();

  useEffect(() => {
    if (error !== null) {
      setToast({ kind: "error", message: describeError(error, config) });
    }
  }, [config, error]);

  useEffect(
    () => () => {
      detectorController.current?.abort();
    },
    [],
  );

  const recordsById = new Map(state?.records.map((record) => [record.stampId, record]) ?? []);
  const nextAvailableIds = new Set(progress.nextAvailableStamps.map((stamp) => stamp.id));

  async function tryAcquire(stampId: string, context: VerificationContext): Promise<boolean> {
    try {
      const result = await acquire(stampId, context);
      if (!result.ok) {
        setToast({ kind: "error", message: describeError(result.error, config) });
        return false;
      }
      const stamp = config.stamps.find((item) => item.id === stampId);
      setToast({ kind: "success", message: `${stamp?.name ?? stampId}を取得しました。` });
      return true;
    } catch (acquireError) {
      const normalized =
        acquireError instanceof Error ? acquireError : new Error(String(acquireError));
      setToast({ kind: "error", message: describeError(normalized, config) });
      return false;
    }
  }

  async function handleTokenSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (token.trim() === "") {
      setToast({ kind: "error", message: "QRトークンを入力してください。" });
      return;
    }
    const acquired = await tryAcquire("spot-b", { type: "token", token: token.trim() });
    if (acquired) setToken("");
  }

  async function acquireGeoStamp(): Promise<void> {
    const currentLatitude = Number(latitude);
    const currentLongitude = Number(longitude);
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

  function beginDetector(kind: ActiveDetector): AbortController | null {
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

  function cancelDetector(): void {
    detectorController.current?.abort();
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

  async function scanNfc(): Promise<void> {
    const controller = beginDetector("nfc");
    if (controller === null) return;
    try {
      const result = await readNfcContext({ signal: controller.signal });
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

  async function scanQr(): Promise<void> {
    const controller = beginDetector("qr");
    if (controller === null) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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

  async function clearState(): Promise<void> {
    try {
      await reset();
      setToken("");
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
    <main className="page-shell" aria-busy={isBusy}>
      <section className="demo-panel">
        <header className="hero">
          <div>
            <p className="eyebrow">@stamprally/core · practical lab</p>
            <h1>Stamp Rally Field Test</h1>
            <p className="description">
              Instant、QRトークン、GPSを一画面で試し、順序制御と永続化を検証できます。
            </p>
          </div>
          <button
            className="secondary-button danger-button"
            type="button"
            onClick={clearState}
            disabled={isBusy}
          >
            Clear State
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
                  disabled={isBusy}
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
                  disabled={isBusy}
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

        <section aria-labelledby="progress-heading" className="progress-section">
          <div className="progress-label">
            <h2 id="progress-heading">Progress</h2>
            <strong>
              {Math.round(progress.percentage)}% · {progress.acquired}/{progress.total}
            </strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="スタンプ取得進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.percentage)}
          >
            <div className="progress-fill" style={{ width: `${progress.percentage}%` }} />
          </div>
          {progress.isCompleted && <p className="complete-message">Rally completed!</p>}
        </section>

        {isPending && (
          <p className="action-status" role="status">
            押印処理を反映しています…
          </p>
        )}

        {isLoading ? (
          <p className="loading-message" role="status">
            保存済みの進捗を読み込んでいます…
          </p>
        ) : (
          <section className="spot-grid" aria-label="スタンプ取得シミュレーター">
            <article className="spot-card">
              <div className="spot-heading">
                <span className="spot-index">A</span>
                <div>
                  <h2>Instant</h2>
                  <p>クリックだけで取得</p>
                </div>
                <span className={`status-badge ${recordsById.has("spot-a") ? "done" : ""}`}>
                  {statusFor("spot-a")}
                </span>
              </div>
              <p className="spot-copy">外部入力を必要としない即時条件を検証します。</p>
              <button
                type="button"
                onClick={() => void tryAcquire("spot-a", { type: "instant" })}
                disabled={isBusy}
              >
                {isPending
                  ? "処理中…"
                  : recordsById.has("spot-a")
                    ? "再取得を試す"
                    : "Spot Aを取得"}
              </button>
              <StampTimestamp acquiredAt={recordsById.get("spot-a")?.acquiredAt} />
            </article>

            <article className="spot-card">
              <div className="spot-heading">
                <span className="spot-index">B</span>
                <div>
                  <h2>QR Token</h2>
                  <p>手入力・QRカメラ・NFC</p>
                </div>
                <span className={`status-badge ${recordsById.has("spot-b") ? "done" : ""}`}>
                  {statusFor("spot-b")}
                </span>
              </div>
              <form onSubmit={handleTokenSubmit} className="token-form">
                <label htmlFor="token">Scanned token</label>
                <input
                  id="token"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="QRトークンを入力"
                  autoComplete="off"
                />
                <div className="button-row">
                  <button type="submit" disabled={isBusy}>
                    {isPending ? "処理中…" : "入力値で取得"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setToken(DEMO_TOKEN);
                      void tryAcquire("spot-b", { type: "token", token: DEMO_TOKEN });
                    }}
                  >
                    正解QRを模擬
                  </button>
                </div>
              </form>
              <div className="detector-block">
                <div className="detector-heading">
                  <strong>Live QR camera</strong>
                  <span className={`support-badge ${qrSupported ? "supported" : ""}`}>
                    {qrSupported ? "対応" : "非対応"}
                  </span>
                </div>
                {/* biome-ignore lint/a11y/useMediaCaption: The muted camera preview has no audio content. */}
                <video
                  ref={qrVideo}
                  className={`qr-preview ${activeDetector === "qr" ? "active" : ""}`}
                  aria-label="QRカメラプレビュー"
                />
                <div className="button-row">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy || !qrSupported}
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
              <div className="detector-block">
                <div className="detector-heading">
                  <strong>Web NFC</strong>
                  <span className={`support-badge ${nfcSupported ? "supported" : ""}`}>
                    {nfcSupported ? "対応" : "非対応"}
                  </span>
                </div>
                <p className="detector-note">HTTPS・対応Android端末・権限許可が必要です。</p>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy || !nfcSupported}
                    onClick={() => void scanNfc()}
                  >
                    {activeDetector === "nfc" ? "NFC待機中…" : "NFCタグをスキャン"}
                  </button>
                  {activeDetector === "nfc" && (
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
              <StampTimestamp acquiredAt={recordsById.get("spot-b")?.acquiredAt} />
            </article>

            <article className="spot-card geo-card">
              <div className="spot-heading">
                <span className="spot-index">C</span>
                <div>
                  <h2>GPS · Tokyo Station</h2>
                  <p>半径{SPOT_C.radiusMeters}m以内</p>
                </div>
                <span className={`status-badge ${recordsById.has("spot-c") ? "done" : ""}`}>
                  {statusFor("spot-c")}
                </span>
              </div>
              <div className="coordinate-grid">
                <label htmlFor="latitude">
                  Latitude
                  <input
                    id="latitude"
                    type="number"
                    step="0.000001"
                    value={latitude}
                    onChange={(event) => setLatitude(event.target.value)}
                  />
                </label>
                <label htmlFor="longitude">
                  Longitude
                  <input
                    id="longitude"
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
                  disabled={isBusy || !geolocationSupported}
                >
                  {activeDetector === "geolocation"
                    ? "GPS取得中…"
                    : "ブラウザの現在地を取得して押印"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => applyPreset(NEARBY_PRESET)}
                >
                  成功プリセット
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => applyPreset(OUTSIDE_PRESET)}
                >
                  圏外プリセット
                </button>
              </div>
              <p className="distance-readout" aria-live="polite">
                {currentDistance === null
                  ? "有効な座標を入力すると目標地点までの距離を表示します。"
                  : `現在座標: ${currentLatitude.toFixed(6)}, ${currentLongitude.toFixed(6)} · 目標まで約${Math.round(currentDistance)}m`}
              </p>
              <button type="button" onClick={() => void acquireGeoStamp()} disabled={isBusy}>
                {isPending
                  ? "処理中…"
                  : recordsById.has("spot-c")
                    ? "再取得を試す"
                    : "現在の座標で取得"}
              </button>
              <StampTimestamp acquiredAt={recordsById.get("spot-c")?.acquiredAt} />
            </article>
          </section>
        )}

        <footer>進捗はLocalStorageへ保存され、再読み込み後も復元されます。</footer>
      </section>

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

function StampTimestamp({ acquiredAt }: { readonly acquiredAt: string | undefined }) {
  return (
    <p className="timestamp">
      {acquiredAt === undefined
        ? "Not acquired"
        : `Acquired: ${new Date(acquiredAt).toLocaleString("ja-JP")}`}
    </p>
  );
}
