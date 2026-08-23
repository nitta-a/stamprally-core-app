import {
  calculateDistanceMeters,
  type DetectorError,
  getCurrentGeoContext,
  isGeolocationSupported,
  isNfcSupported,
  isQrSupported,
  readNfcContext,
  readQrContext,
  type StampDefinition,
  type StampRecord,
  type VerificationContext,
} from "@stamprally/core";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { StampPresentation } from "./StampSlot.js";

export interface AcquisitionFeedback {
  readonly ok: boolean;
  readonly message: string;
}

export interface StampModalProps {
  readonly open: boolean;
  readonly stamp: StampDefinition | null;
  readonly record: StampRecord | undefined;
  readonly presentation: StampPresentation | null;
  readonly isAvailable: boolean;
  readonly requiredStampName: string | null;
  readonly isPending: boolean;
  readonly onClose: () => void;
  readonly onAcquire: (
    stampId: string,
    context: VerificationContext,
  ) => Promise<AcquisitionFeedback>;
  readonly onNotify: (feedback: AcquisitionFeedback) => void;
}

type DetectorName = "geolocation" | "nfc" | "qr";
type TokenTab = "sensor" | "manual";

function describeDetectorError(error: DetectorError): string {
  switch (error.code) {
    case "UNSUPPORTED":
      return error.detector === "nfc"
        ? "この端末はWeb NFCに対応していません。手入力をご利用ください。"
        : error.detector === "qr"
          ? "このブラウザはライブQR読取に対応していません。手入力をご利用ください。"
          : "このブラウザは位置情報取得に対応していません。";
    case "PERMISSION_DENIED":
      return "センサーの利用が拒否されました。ブラウザの権限設定を確認してください。";
    case "POSITION_UNAVAILABLE":
      return "現在地を取得できませんでした。プリセット座標も利用できます。";
    case "TIMEOUT":
      return "センサーの待機時間を超えました。もう一度お試しください。";
    case "ABORTED":
      return "センサーの読み取りをキャンセルしました。";
    case "NO_TOKEN":
      return "読み取り可能なテキストトークンがありません。";
    case "INVALID_DATA":
      return "センサーから無効なデータが返されました。";
    case "READ_FAILED":
      return "センサーの読み取りに失敗しました。";
  }
}

function outsideCoordinate(value: number): string {
  return String(Number((value + 0.01).toFixed(6)));
}

export function StampModal({
  open,
  stamp,
  record,
  presentation,
  isAvailable,
  requiredStampName,
  isPending,
  onClose,
  onAcquire,
  onNotify,
}: StampModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorController = useRef<AbortController | null>(null);
  const [activeDetector, setActiveDetector] = useState<DetectorName | null>(null);
  const [feedback, setFeedback] = useState<AcquisitionFeedback | null>(null);
  const [token, setToken] = useState("");
  const [tokenTab, setTokenTab] = useState<TokenTab>("sensor");
  const geoCondition = stamp?.condition.type === "geo" ? stamp.condition : null;
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const canAcquire = isAvailable || record !== undefined;
  const isBusy = isPending || activeDetector !== null;
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
  const sensorSupported = useMemo(() => {
    if (presentation?.channel === "qr") return isQrSupported();
    if (presentation?.channel === "nfc") return isNfcSupported();
    if (presentation?.channel === "geo") return isGeolocationSupported();
    return true;
  }, [presentation?.channel]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    detectorController.current?.abort();
    detectorController.current = null;
    setActiveDetector(null);
    setFeedback(null);
    setToken("");
    setTokenTab("sensor");
    if (geoCondition === null) {
      setLatitude("");
      setLongitude("");
    } else {
      setLatitude(outsideCoordinate(geoCondition.latitude));
      setLongitude(outsideCoordinate(geoCondition.longitude));
    }
  }, [geoCondition]);

  useEffect(
    () => () => {
      detectorController.current?.abort();
    },
    [],
  );

  function publish(result: AcquisitionFeedback): void {
    setFeedback(result);
    onNotify(result);
  }

  async function submit(context: VerificationContext): Promise<void> {
    if (stamp === null || !canAcquire) return;
    setFeedback(null);
    const result = await onAcquire(stamp.id, context);
    setFeedback(result);
    if (result.ok) onClose();
  }

  function beginDetector(detector: DetectorName): AbortController | null {
    if (detectorController.current !== null) return null;
    const controller = new AbortController();
    detectorController.current = controller;
    setActiveDetector(detector);
    setFeedback(null);
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

  async function scanQr(): Promise<void> {
    const controller = beginDetector("qr");
    const video = videoRef.current;
    if (controller === null) return;
    if (video === null) {
      finishDetector(controller);
      publish({ ok: false, message: "QRプレビューを初期化できませんでした。" });
      return;
    }
    try {
      const result = await readQrContext(video, { signal: controller.signal });
      if (!result.ok) {
        publish({ ok: false, message: describeDetectorError(result.error) });
        return;
      }
      setToken(result.value.token);
      await submit(result.value);
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
        publish({ ok: false, message: describeDetectorError(result.error) });
        return;
      }
      setToken(result.value.token);
      await submit(result.value);
    } finally {
      finishDetector(controller);
    }
  }

  async function locateAndAcquire(): Promise<void> {
    const controller = beginDetector("geolocation");
    if (controller === null) return;
    try {
      const result = await getCurrentGeoContext({ enableHighAccuracy: true, timeout: 10_000 });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        publish({ ok: false, message: describeDetectorError(result.error) });
        return;
      }
      setLatitude(result.value.currentLatitude.toFixed(6));
      setLongitude(result.value.currentLongitude.toFixed(6));
      await submit(result.value);
    } finally {
      finishDetector(controller);
    }
  }

  async function submitToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalized = token.trim();
    if (normalized === "") {
      publish({ ok: false, message: "トークンを入力してください。" });
      return;
    }
    await submit({ type: "token", token: normalized });
  }

  async function submitCoordinates(): Promise<void> {
    if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) {
      publish({ ok: false, message: "有効な緯度と経度を入力してください。" });
      return;
    }
    await submit({
      type: "geo",
      currentLatitude: latitudeValue,
      currentLongitude: longitudeValue,
    });
  }

  function requestClose(): void {
    if (isPending) return;
    detectorController.current?.abort();
    onClose();
  }

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault();
    requestClose();
  }

  const tokenCondition = stamp?.condition.type === "token" ? stamp.condition : null;

  return (
    <dialog
      ref={dialogRef}
      className="stamp-modal"
      aria-labelledby="stamp-modal-title"
      onCancel={handleCancel}
    >
      {stamp !== null && presentation !== null && (
        <div className="stamp-modal__content">
          <header className="stamp-modal__header">
            <div
              className={`stamp-modal__icon stamp-modal__icon--${presentation.ink}`}
              aria-hidden="true"
            >
              {presentation.icon}
            </div>
            <div>
              <p>{presentation.label}</p>
              <h2 id="stamp-modal-title">{stamp.name}</h2>
            </div>
            <button
              className="stamp-modal__close"
              type="button"
              onClick={requestClose}
              disabled={isPending}
              aria-label="スタンプ詳細を閉じる"
            >
              ×
            </button>
          </header>

          {!canAcquire && (
            <div className="stamp-modal__notice stamp-modal__notice--locked" role="status">
              🔒 先に「{requiredStampName ?? "次のスタンプ"}」を取得してください。
            </div>
          )}
          {record !== undefined && (
            <div className="stamp-modal__notice" role="status">
              取得済みです。再度押印すると重複エラーを確認できます。
            </div>
          )}

          <div className="stamp-modal__body" aria-busy={isBusy}>
            {presentation.channel === "instant" && (
              <section className="stamp-modal__action-panel">
                <p>外部入力を使わず、その場でスタンプを押します。</p>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!canAcquire || isBusy}
                  onClick={() => void submit({ type: "instant" })}
                >
                  {isPending ? "押印中…" : "スタンプを押す"}
                </button>
              </section>
            )}

            {(presentation.channel === "qr" || presentation.channel === "nfc") && (
              <section className="stamp-modal__action-panel">
                <div className="stamp-modal__tabs" role="tablist" aria-label="トークン取得方法">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tokenTab === "sensor"}
                    className={tokenTab === "sensor" ? "active" : ""}
                    onClick={() => setTokenTab("sensor")}
                    disabled={isBusy}
                  >
                    {presentation.channel === "qr" ? "QRカメラ" : "Web NFC"}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tokenTab === "manual"}
                    className={tokenTab === "manual" ? "active" : ""}
                    onClick={() => setTokenTab("manual")}
                    disabled={isBusy}
                  >
                    手入力
                  </button>
                </div>

                {tokenTab === "sensor" ? (
                  <div className="stamp-modal__sensor-panel" role="tabpanel">
                    <span className={`support-badge ${sensorSupported ? "supported" : ""}`}>
                      {sensorSupported ? "この端末で利用可能" : "非対応・手入力を利用してください"}
                    </span>
                    {presentation.channel === "qr" ? (
                      <>
                        {/* biome-ignore lint/a11y/useMediaCaption: The muted QR camera preview has no audio content. */}
                        <video
                          ref={videoRef}
                          className={`qr-preview ${activeDetector === "qr" ? "active" : ""}`}
                          aria-label="QRカメラプレビュー"
                        />
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!canAcquire || isBusy || !sensorSupported}
                          onClick={() => void scanQr()}
                        >
                          {activeDetector === "qr" ? "QR待機中…" : "QRコードをスキャン"}
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={!canAcquire || isBusy || !sensorSupported}
                        onClick={() => void scanNfc()}
                      >
                        {activeDetector === "nfc" ? "NFC待機中…" : "NFCタグをスキャン"}
                      </button>
                    )}
                    {activeDetector !== null && (
                      <button className="secondary-button" type="button" onClick={cancelDetector}>
                        読み取りをキャンセル
                      </button>
                    )}
                  </div>
                ) : (
                  <form className="stamp-modal__token-form" role="tabpanel" onSubmit={submitToken}>
                    <label htmlFor="modal-token">Token</label>
                    <input
                      id="modal-token"
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      autoComplete="off"
                      placeholder="トークンを入力"
                    />
                    <div className="button-row">
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={!canAcquire || isBusy}
                      >
                        入力値で押印
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={!canAcquire || isBusy || tokenCondition === null}
                        onClick={() => {
                          if (tokenCondition !== null) {
                            setToken(tokenCondition.token);
                            void submit({ type: "token", token: tokenCondition.token });
                          }
                        }}
                      >
                        正解トークンを模擬
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

            {presentation.channel === "geo" && geoCondition !== null && (
              <section className="stamp-modal__action-panel">
                <dl className="stamp-modal__geo-details">
                  <div>
                    <dt>Target</dt>
                    <dd>
                      {geoCondition.latitude}, {geoCondition.longitude}
                    </dd>
                  </div>
                  <div>
                    <dt>Radius</dt>
                    <dd>{geoCondition.radiusMeters}m</dd>
                  </div>
                </dl>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!canAcquire || isBusy || !sensorSupported}
                  onClick={() => void locateAndAcquire()}
                >
                  {activeDetector === "geolocation" ? "現在地を測定中…" : "現在地を測定して押印"}
                </button>
                <div className="stamp-modal__coordinate-grid">
                  <label htmlFor="modal-latitude">
                    Latitude
                    <input
                      id="modal-latitude"
                      type="number"
                      step="0.000001"
                      value={latitude}
                      onChange={(event) => setLatitude(event.target.value)}
                    />
                  </label>
                  <label htmlFor="modal-longitude">
                    Longitude
                    <input
                      id="modal-longitude"
                      type="number"
                      step="0.000001"
                      value={longitude}
                      onChange={(event) => setLongitude(event.target.value)}
                    />
                  </label>
                </div>
                <p className="stamp-modal__distance" aria-live="polite">
                  {distance === null
                    ? "有効な座標を入力してください。"
                    : `目標地点まで約${Math.round(distance)}m`}
                </p>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setLatitude(String(geoCondition.latitude));
                      setLongitude(String(geoCondition.longitude));
                    }}
                  >
                    成功プリセット
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setLatitude(outsideCoordinate(geoCondition.latitude));
                      setLongitude(outsideCoordinate(geoCondition.longitude));
                    }}
                  >
                    圏外プリセット
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!canAcquire || isBusy}
                    onClick={() => void submitCoordinates()}
                  >
                    入力座標で押印
                  </button>
                </div>
              </section>
            )}
          </div>

          {feedback !== null && (
            <p
              className={`stamp-modal__feedback stamp-modal__feedback--${feedback.ok ? "success" : "error"}`}
              role={feedback.ok ? "status" : "alert"}
            >
              {feedback.message}
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
