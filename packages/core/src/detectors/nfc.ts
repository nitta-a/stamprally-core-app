import type { DetectorError, DetectorResult, TokenVerificationContext } from "./types.js";
import { createDetectorError, mapBrowserError } from "./types.js";

interface NdefRecordLike {
  readonly recordType: string;
  readonly encoding?: string;
  readonly data?: DataView;
}

interface NdefReadingEventLike {
  readonly message: {
    readonly records: ReadonlyArray<NdefRecordLike>;
  };
}

interface NdefReaderLike {
  onreading: ((event: NdefReadingEventLike) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
  scan(options?: { readonly signal?: AbortSignal }): Promise<void>;
}

interface NdefReaderConstructorLike {
  new (): NdefReaderLike;
}

export interface NfcDetectorOptions {
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function getNdefReaderConstructor(): NdefReaderConstructorLike | undefined {
  return (globalThis as { readonly NDEFReader?: NdefReaderConstructorLike }).NDEFReader;
}

export function isNfcSupported(): boolean {
  return getNdefReaderConstructor() !== undefined;
}

function decodeFirstTextRecord(event: NdefReadingEventLike): string | null {
  for (const record of event.message.records) {
    if (record.recordType !== "text" || record.data === undefined) continue;
    try {
      const token = new TextDecoder(record.encoding ?? "utf-8").decode(record.data);
      if (token.length > 0) return token;
    } catch {
      // Try the next text record when one payload cannot be decoded.
    }
  }
  return null;
}

export function readNfcContext(
  options: NfcDetectorOptions = {},
): Promise<DetectorResult<TokenVerificationContext>> {
  const Reader = getNdefReaderConstructor();
  if (Reader === undefined) {
    return Promise.resolve({
      ok: false,
      error: createDetectorError("nfc", "UNSUPPORTED", "Web NFC is not supported."),
    });
  }
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout < 0) {
    return Promise.resolve({
      ok: false,
      error: createDetectorError(
        "nfc",
        "INVALID_DATA",
        "NFC timeout must be a non-negative finite number.",
      ),
    });
  }
  if (options.signal?.aborted === true) {
    return Promise.resolve({
      ok: false,
      error: createDetectorError("nfc", "ABORTED", "NFC detection was aborted."),
    });
  }

  let reader: NdefReaderLike;
  try {
    reader = new Reader();
  } catch (error) {
    return Promise.resolve({ ok: false, error: mapBrowserError("nfc", error) });
  }

  return new Promise((resolve) => {
    const scanController = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: DetectorResult<TokenVerificationContext>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", handleAbort);
      reader.onreading = null;
      reader.onreadingerror = null;
      scanController.abort();
      resolve(result);
    };
    const fail = (error: DetectorError) => finish({ ok: false, error });
    const handleAbort = () =>
      fail(createDetectorError("nfc", "ABORTED", "NFC detection was aborted."));

    options.signal?.addEventListener("abort", handleAbort, { once: true });
    timer = setTimeout(
      () => fail(createDetectorError("nfc", "TIMEOUT", "NFC detection timed out.")),
      timeout,
    );
    reader.onreading = (event) => {
      const token = decodeFirstTextRecord(event);
      if (token === null) {
        fail(createDetectorError("nfc", "NO_TOKEN", "The NFC tag has no text token."));
        return;
      }
      finish({ ok: true, value: { type: "token", token } });
    };
    reader.onreadingerror = (event) =>
      fail(createDetectorError("nfc", "READ_FAILED", "The NFC tag could not be read.", event));

    try {
      void reader
        .scan({ signal: scanController.signal })
        .catch((error: unknown) => fail(mapBrowserError("nfc", error)));
    } catch (error) {
      fail(mapBrowserError("nfc", error));
    }
  });
}
