import type { Result } from "../domain/index.js";
import type { DetectorError, DetectorResult, TokenVerificationContext } from "./types.js";
import { createDetectorError, mapBrowserError } from "./types.js";

interface DetectedBarcodeLike {
  readonly rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<ReadonlyArray<DetectedBarcodeLike>>;
}

interface BarcodeDetectorConstructorLike {
  new (options?: { readonly formats?: ReadonlyArray<string> }): BarcodeDetectorLike;
}

export interface QrDetectorOptions {
  readonly timeout?: number;
  readonly signal?: AbortSignal;
  readonly facingMode?: "user" | "environment";
}

interface Termination {
  readonly promise: Promise<DetectorError>;
  readonly cleanup: () => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const SCAN_INTERVAL_MS = 120;

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructorLike | undefined {
  return (globalThis as { readonly BarcodeDetector?: BarcodeDetectorConstructorLike })
    .BarcodeDetector;
}

function getMediaDevices(): MediaDevices | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
}

export function isQrSupported(): boolean {
  return (
    getBarcodeDetectorConstructor() !== undefined &&
    typeof getMediaDevices()?.getUserMedia === "function"
  );
}

function createTermination(timeout: number, signal: AbortSignal | undefined): Termination {
  let settle: ((error: DetectorError) => void) | undefined;
  const promise = new Promise<DetectorError>((resolve) => {
    settle = resolve;
  });
  const handleAbort = () =>
    settle?.(createDetectorError("qr", "ABORTED", "QR detection was aborted."));
  signal?.addEventListener("abort", handleAbort, { once: true });
  const timer = setTimeout(
    () => settle?.(createDetectorError("qr", "TIMEOUT", "QR detection timed out.")),
    timeout,
  );
  return {
    promise,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
      settle = undefined;
    },
  };
}

async function raceWithTermination<T>(
  operation: Promise<T>,
  termination: Promise<DetectorError>,
): Promise<Result<T, DetectorError>> {
  return Promise.race([
    operation.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error: mapBrowserError("qr", error) }),
    ),
    termination.then((error) => ({ ok: false as const, error })),
  ]);
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function waitForNextScan(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
}

export async function readQrContext(
  videoElement: HTMLVideoElement,
  options: QrDetectorOptions = {},
): Promise<DetectorResult<TokenVerificationContext>> {
  const Detector = getBarcodeDetectorConstructor();
  const mediaDevices = getMediaDevices();
  if (Detector === undefined || typeof mediaDevices?.getUserMedia !== "function") {
    return {
      ok: false,
      error: createDetectorError(
        "qr",
        "UNSUPPORTED",
        "Live QR detection is not supported in this environment.",
      ),
    };
  }
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout < 0) {
    return {
      ok: false,
      error: createDetectorError(
        "qr",
        "INVALID_DATA",
        "QR timeout must be a non-negative finite number.",
      ),
    };
  }
  if (options.signal?.aborted === true) {
    return {
      ok: false,
      error: createDetectorError("qr", "ABORTED", "QR detection was aborted."),
    };
  }

  const termination = createTermination(timeout, options.signal);
  let stream: MediaStream | null = null;
  try {
    const mediaPromise = mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: options.facingMode ?? "environment" } },
    });
    const mediaResult = await raceWithTermination(mediaPromise, termination.promise);
    if (!mediaResult.ok) {
      void mediaPromise.then(stopStream, () => undefined);
      return mediaResult;
    }
    stream = mediaResult.value;
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.playsInline = true;

    const playResult = await raceWithTermination(videoElement.play(), termination.promise);
    if (!playResult.ok) return playResult;

    const detector = new Detector({ formats: ["qr_code"] });
    while (true) {
      const detection = await raceWithTermination(
        detector.detect(videoElement),
        termination.promise,
      );
      if (!detection.ok) return detection;
      const token = detection.value.find((barcode) => barcode.rawValue.length > 0)?.rawValue;
      if (token !== undefined) {
        return { ok: true, value: { type: "token", token } };
      }

      const interval = await raceWithTermination(waitForNextScan(), termination.promise);
      if (!interval.ok) return interval;
    }
  } catch (error) {
    return { ok: false, error: mapBrowserError("qr", error) };
  } finally {
    termination.cleanup();
    if (stream !== null) stopStream(stream);
    try {
      videoElement.srcObject = null;
    } catch {
      // A custom video element implementation may expose a read-only srcObject.
    }
  }
}
