import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentGeoContext,
  isGeolocationSupported,
  isNfcSupported,
  isQrSupported,
  normalizePasscode,
  readNfcContext,
  readQrContext,
  verifyPasscode,
} from "../src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("passcode detector", () => {
  it("normalizes width, whitespace, and letter case without changing the input", () => {
    const input = "  Ｓｔａｆｆ１２３  ";

    expect(normalizePasscode(input)).toBe("STAFF123");
    expect(input).toBe("  Ｓｔａｆｆ１２３  ");
    expect(verifyPasscode(input, { passcode: "staff123" })).toEqual({ success: true });
  });

  it("supports case-sensitive verification and returns a typed mismatch", () => {
    expect(verifyPasscode("Staff123", { passcode: "STAFF123", caseSensitive: true })).toEqual({
      success: false,
      reason: "INVALID_PASSCODE",
      message: "The passcode is invalid.",
    });
    expect(
      verifyPasscode("ＳＴＡＦＦ１２３", {
        passcode: "STAFF123",
        caseSensitive: true,
      }),
    ).toEqual({ success: true });
  });
});

describe("geolocation detector", () => {
  it("returns validated coordinates and forwards browser options", async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback, _failure: PositionErrorCallback, options?: PositionOptions) => {
        success({ coords: { latitude: 35.681236, longitude: 139.767125 } } as GeolocationPosition);
        expect(options).toEqual({ enableHighAccuracy: true, timeout: 5_000 });
      },
    );
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    expect(isGeolocationSupported()).toBe(true);
    await expect(
      getCurrentGeoContext({ enableHighAccuracy: true, timeout: 5_000 }),
    ).resolves.toEqual({
      ok: true,
      value: {
        type: "geo",
        currentLatitude: 35.681236,
        currentLongitude: 139.767125,
      },
    });
  });

  it.each([
    [1, "PERMISSION_DENIED"],
    [2, "POSITION_UNAVAILABLE"],
    [3, "TIMEOUT"],
  ] as const)("maps position error %s to %s", async (browserCode, detectorCode) => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({ code: browserCode, message: "failed" } as GeolocationPositionError),
      },
    });

    await expect(getCurrentGeoContext()).resolves.toMatchObject({
      ok: false,
      error: { detector: "geolocation", code: detectorCode },
    });
  });

  it("handles unsupported, synchronous failure, and invalid coordinates", async () => {
    vi.stubGlobal("navigator", {});
    expect(isGeolocationSupported()).toBe(false);
    await expect(getCurrentGeoContext()).resolves.toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED" },
    });

    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: () => {
          throw new Error("blocked");
        },
      },
    });
    await expect(getCurrentGeoContext()).resolves.toMatchObject({
      ok: false,
      error: { code: "READ_FAILED" },
    });

    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 91, longitude: Number.NaN } } as GeolocationPosition),
      },
    });
    await expect(getCurrentGeoContext()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_DATA" },
    });
  });
});

interface MockNdefRecord {
  readonly recordType: string;
  readonly encoding?: string;
  readonly data?: DataView;
}

interface MockNdefReadingEvent {
  readonly message: { readonly records: ReadonlyArray<MockNdefRecord> };
}

class MockNdefReader {
  static latest: MockNdefReader | null = null;
  onreading: ((event: MockNdefReadingEvent) => void) | null = null;
  onreadingerror: ((event: Event) => void) | null = null;
  readonly scan = vi.fn(async (_options?: { readonly signal?: AbortSignal }) => undefined);

  constructor() {
    MockNdefReader.latest = this;
  }
}

describe("NFC detector", () => {
  it("decodes the first text token and cleans up listeners", async () => {
    vi.stubGlobal("NDEFReader", MockNdefReader);
    expect(isNfcSupported()).toBe(true);
    const reading = readNfcContext({ timeout: 100 });
    const reader = MockNdefReader.latest;
    expect(reader).not.toBeNull();
    const bytes = new TextEncoder().encode("STAMP-B-2026");
    reader?.onreading?.({
      message: {
        records: [
          { recordType: "url", data: new DataView(bytes.buffer) },
          { recordType: "text", encoding: "utf-8", data: new DataView(bytes.buffer) },
        ],
      },
    });

    await expect(reading).resolves.toEqual({
      ok: true,
      value: { type: "token", token: "STAMP-B-2026" },
    });
    expect(reader?.onreading).toBeNull();
    expect(reader?.onreadingerror).toBeNull();
  });

  it("returns typed unsupported, no-token, timeout, and abort results", async () => {
    vi.stubGlobal("NDEFReader", undefined);
    expect(isNfcSupported()).toBe(false);
    await expect(readNfcContext()).resolves.toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED" },
    });

    vi.stubGlobal("NDEFReader", MockNdefReader);
    const noToken = readNfcContext({ timeout: 100 });
    MockNdefReader.latest?.onreading?.({ message: { records: [] } });
    await expect(noToken).resolves.toMatchObject({ ok: false, error: { code: "NO_TOKEN" } });

    await expect(readNfcContext({ timeout: 1 })).resolves.toMatchObject({
      ok: false,
      error: { code: "TIMEOUT" },
    });

    const controller = new AbortController();
    const aborted = readNfcContext({ signal: controller.signal, timeout: 100 });
    controller.abort();
    await expect(aborted).resolves.toMatchObject({ ok: false, error: { code: "ABORTED" } });
  });

  it("maps NFC permission failures and clears its listeners", async () => {
    class DeniedNdefReader extends MockNdefReader {
      override readonly scan = vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError");
      });
    }
    vi.stubGlobal("NDEFReader", DeniedNdefReader);

    await expect(readNfcContext({ timeout: 100 })).resolves.toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
    expect(DeniedNdefReader.latest?.onreading).toBeNull();
    expect(DeniedNdefReader.latest?.onreadingerror).toBeNull();
  });
});

function createVideo(): HTMLVideoElement {
  return {
    srcObject: null,
    muted: false,
    playsInline: false,
    play: vi.fn(async () => undefined),
  } as unknown as HTMLVideoElement;
}

describe("QR detector", () => {
  it("scans multiple frames and always stops the camera", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    const detect = vi
      .fn<() => Promise<ReadonlyArray<{ readonly rawValue: string }>>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rawValue: "STAMP-B-2026" }]);
    class MockBarcodeDetector {
      detect = detect;
    }
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("BarcodeDetector", MockBarcodeDetector);
    const video = createVideo();

    expect(isQrSupported()).toBe(true);
    await expect(readQrContext(video, { timeout: 1_000 })).resolves.toEqual({
      ok: true,
      value: { type: "token", token: "STAMP-B-2026" },
    });
    expect(detect).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it("handles unsupported, permission failure, timeout, and abort without leaking tracks", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("BarcodeDetector", undefined);
    expect(isQrSupported()).toBe(false);
    await expect(readQrContext(createVideo())).resolves.toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED" },
    });

    class MockBarcodeDetector {
      async detect(): Promise<ReadonlyArray<{ readonly rawValue: string }>> {
        return [];
      }
    }
    vi.stubGlobal("BarcodeDetector", MockBarcodeDetector);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException("denied", "NotAllowedError");
        }),
      },
    });
    await expect(readQrContext(createVideo())).resolves.toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });

    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
    });
    await expect(readQrContext(createVideo(), { timeout: 1 })).resolves.toMatchObject({
      ok: false,
      error: { code: "TIMEOUT" },
    });
    expect(stop).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    const aborted = readQrContext(createVideo(), { signal: controller.signal, timeout: 100 });
    controller.abort();
    await expect(aborted).resolves.toMatchObject({ ok: false, error: { code: "ABORTED" } });
  });
});
