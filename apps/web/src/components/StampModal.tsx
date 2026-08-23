import {
  calculateDistanceMeters,
  type DetectorError,
  getCurrentGeoContext,
  isGeolocationSupported,
  isNfcSupported,
  isQrSupported,
  readNfcContext,
  readQrContext,
  resolveLocalizedText,
  type StampDefinition,
  type StampRecord,
  type SupportedLocale,
  type VerificationContext,
} from "@stamprally/core";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { getMessages } from "../locales/index.js";
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
  readonly locale?: SupportedLocale;
  readonly onClose: () => void;
  readonly onAcquire: (
    stampId: string,
    context: VerificationContext,
  ) => Promise<AcquisitionFeedback>;
  readonly onNotify: (feedback: AcquisitionFeedback) => void;
}

type DetectorName = "geolocation" | "nfc" | "qr";

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
  locale = "ja",
  onClose,
  onAcquire,
  onNotify,
}: StampModalProps) {
  const messages = getMessages(locale);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorController = useRef<AbortController | null>(null);
  const [activeDetector, setActiveDetector] = useState<DetectorName | null>(null);
  const [feedback, setFeedback] = useState<AcquisitionFeedback | null>(null);
  const [token, setToken] = useState("");
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
    if (geoCondition === null) {
      setLatitude("");
      setLongitude("");
    } else {
      setLatitude(outsideCoordinate(geoCondition.latitude));
      setLongitude(outsideCoordinate(geoCondition.longitude));
    }
  }, [geoCondition]);

  useEffect(() => () => detectorController.current?.abort(), []);

  function detectorMessage(error: DetectorError): string {
    switch (error.code) {
      case "UNSUPPORTED":
        return messages.errorUnsupported;
      case "PERMISSION_DENIED":
        return messages.errorPermission;
      case "TIMEOUT":
        return messages.errorTimeout;
      case "ABORTED":
        return messages.errorAborted;
      default:
        return messages.errorRead;
    }
  }

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

  function beginDetector(name: DetectorName): AbortController | null {
    if (detectorController.current !== null) return null;
    const controller = new AbortController();
    detectorController.current = controller;
    setActiveDetector(name);
    setFeedback(null);
    return controller;
  }

  function finishDetector(controller: AbortController): void {
    if (detectorController.current !== controller) return;
    detectorController.current = null;
    setActiveDetector(null);
  }

  async function scanQr(): Promise<void> {
    const controller = beginDetector("qr");
    if (controller === null) return;
    const video = videoRef.current;
    if (video === null) {
      finishDetector(controller);
      publish({ ok: false, message: messages.errorRead });
      return;
    }
    try {
      const result = await readQrContext(video, { signal: controller.signal });
      if (result.ok) await submit(result.value);
      else publish({ ok: false, message: detectorMessage(result.error) });
    } finally {
      finishDetector(controller);
    }
  }

  async function scanNfc(): Promise<void> {
    const controller = beginDetector("nfc");
    if (controller === null) return;
    try {
      const result = await readNfcContext({ signal: controller.signal });
      if (result.ok) await submit(result.value);
      else publish({ ok: false, message: detectorMessage(result.error) });
    } finally {
      finishDetector(controller);
    }
  }

  async function locate(): Promise<void> {
    const controller = beginDetector("geolocation");
    if (controller === null) return;
    try {
      const result = await getCurrentGeoContext({ enableHighAccuracy: true, timeout: 10_000 });
      if (result.ok) {
        setLatitude(String(result.value.currentLatitude));
        setLongitude(String(result.value.currentLongitude));
        await submit(result.value);
      } else publish({ ok: false, message: detectorMessage(result.error) });
    } finally {
      finishDetector(controller);
    }
  }

  async function submitToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (token.trim() === "") {
      publish({ ok: false, message: messages.tokenRequired });
      return;
    }
    await submit({ type: "token", token: token.trim() });
  }

  async function submitCoordinates(): Promise<void> {
    if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) {
      publish({ ok: false, message: messages.invalidCoordinates });
      return;
    }
    await submit({ type: "geo", currentLatitude: latitudeValue, currentLongitude: longitudeValue });
  }

  const name = stamp === null ? "" : resolveLocalizedText(stamp.name, locale);
  const description = stamp === null ? "" : resolveLocalizedText(stamp.description, locale);
  const hint = stamp === null ? "" : resolveLocalizedText(stamp.hint, locale);

  return (
    <dialog
      ref={dialogRef}
      className="stamp-modal"
      aria-labelledby="stamp-modal-title"
      onCancel={(event) => {
        if (isBusy) event.preventDefault();
        else onClose();
      }}
      onClose={() => {
        detectorController.current?.abort();
        if (!isBusy) onClose();
      }}
    >
      {stamp !== null && (
        <div className="stamp-modal__panel">
          <header className="stamp-modal__header">
            <div>
              <p className="eyebrow">{messages.details}</p>
              <h2 id="stamp-modal-title">{name}</h2>
              {description !== "" && <p>{description}</p>}
            </div>
            <button
              type="button"
              className="stamp-modal__close"
              disabled={isBusy}
              onClick={onClose}
              aria-label={messages.close}
            >
              ×
            </button>
          </header>
          {hint !== "" && <p className="stamp-modal__hint">💡 {hint}</p>}
          {record !== undefined && <p>{messages.alreadyAcquired}</p>}
          {!canAcquire && requiredStampName !== null && (
            <p className="stamp-modal__locked">{messages.requiredFirst(requiredStampName)}</p>
          )}

          {stamp.condition.type === "instant" && (
            <section>
              <p>{messages.instantDescription}</p>
              <button
                className="primary-button"
                type="button"
                disabled={!canAcquire || isBusy}
                onClick={() => void submit({ type: "instant" })}
              >
                {messages.pressStamp}
              </button>
            </section>
          )}

          {stamp.condition.type === "token" && (
            <section className="token-actions">
              <form onSubmit={(event) => void submitToken(event)}>
                <label>
                  {messages.tokenInput}
                  <input
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder={messages.tokenPlaceholder}
                  />
                </label>
                <button className="primary-button" type="submit" disabled={!canAcquire || isBusy}>
                  {messages.submitToken}
                </button>
              </form>
              {/* biome-ignore lint/a11y/useMediaCaption: Muted QR preview has no audio. */}
              <video
                ref={videoRef}
                className={`qr-preview ${activeDetector === "qr" ? "active" : ""}`}
                aria-label={messages.scanQr}
              />
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canAcquire || isBusy || !isQrSupported()}
                  onClick={() => void scanQr()}
                >
                  {messages.scanQr} · {isQrSupported() ? messages.supported : messages.unsupported}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canAcquire || isBusy || !isNfcSupported()}
                  onClick={() => void scanNfc()}
                >
                  {messages.scanNfc} ·{" "}
                  {isNfcSupported() ? messages.supported : messages.unsupported}
                </button>
              </div>
            </section>
          )}

          {geoCondition !== null && (
            <section>
              <p>
                {messages.target}: {geoCondition.latitude}, {geoCondition.longitude} ·{" "}
                {messages.radius(geoCondition.radiusMeters)}
              </p>
              <div className="coordinate-grid">
                <label>
                  {messages.latitude}
                  <input
                    type="number"
                    step="0.000001"
                    value={latitude}
                    onChange={(event) => setLatitude(event.target.value)}
                  />
                </label>
                <label>
                  {messages.longitude}
                  <input
                    type="number"
                    step="0.000001"
                    value={longitude}
                    onChange={(event) => setLongitude(event.target.value)}
                  />
                </label>
              </div>
              <p className="stamp-modal__distance">
                {distance === null
                  ? messages.invalidCoordinates
                  : messages.distance(Math.round(distance))}
              </p>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canAcquire || isBusy || !isGeolocationSupported()}
                  onClick={() => void locate()}
                >
                  {messages.useCurrentLocation}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setLatitude(String(geoCondition.latitude));
                    setLongitude(String(geoCondition.longitude));
                  }}
                >
                  {messages.successPreset}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!canAcquire || isBusy}
                  onClick={() => void submitCoordinates()}
                >
                  {messages.coordinatesAction}
                </button>
              </div>
            </section>
          )}

          {activeDetector !== null && (
            <button
              type="button"
              className="secondary-button danger-button"
              onClick={() => detectorController.current?.abort()}
            >
              {messages.cancel}
            </button>
          )}
          {feedback !== null && (
            <p
              className={`stamp-modal__feedback stamp-modal__feedback--${feedback.ok ? "success" : "error"}`}
              role={feedback.ok ? "status" : "alert"}
            >
              {feedback.message}
            </p>
          )}
          <span className="stamp-modal__channel" aria-hidden="true">
            {presentation?.icon}
          </span>
        </div>
      )}
    </dialog>
  );
}
