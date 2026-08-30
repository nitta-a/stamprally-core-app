import { describe, expect, it, vi } from "vitest";
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

describe("passcode detector", () => {
  it("normalizes Unicode and whitespace while respecting case sensitivity", () => {
    expect(normalizePasscode("  ｏｐｅｎ  ")).toBe("OPEN");
    expect(normalizePasscode("  Open  ", true)).toBe("Open");
    expect(verifyPasscode(" open ", { code: "ＯＰＥＮ" })).toEqual({ success: true });
    expect(verifyPasscode("open", { code: "Open", caseSensitive: true })).toMatchObject({
      success: false,
    });
  });
});

describe("geolocation detector", () => {
  it("returns typed unsupported and invalid-option errors", async () => {
    vi.stubGlobal("navigator", {});
    expect(isGeolocationSupported()).toBe(false);
    await expect(getCurrentGeoContext()).resolves.toMatchObject({
      ok: false,
      error: { detector: "geolocation", code: "UNSUPPORTED" },
    });

    vi.stubGlobal("navigator", { geolocation: {} });
    await expect(getCurrentGeoContext({ timeout: -1 })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_DATA" },
    });
    vi.unstubAllGlobals();
  });

  it("maps successful positions and browser error codes", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
      success({ coords: { latitude: 35.6812, longitude: 139.7671 } } as GeolocationPosition);
      error({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    await expect(
      getCurrentGeoContext({ enableHighAccuracy: true, timeout: 5000 }),
    ).resolves.toEqual({
      ok: true,
      value: { type: "gps", latitude: 35.6812, longitude: 139.7671 },
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 5000,
    });

    const unavailable = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: 2, message: "unavailable" } as GeolocationPositionError);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: unavailable } });
    await expect(getCurrentGeoContext()).resolves.toMatchObject({
      ok: false,
      error: { code: "POSITION_UNAVAILABLE" },
    });
    vi.unstubAllGlobals();
  });

  it("rejects invalid coordinates returned by the browser", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 91, longitude: 0 } } as GeolocationPosition),
      },
    });
    await expect(getCurrentGeoContext()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_DATA" },
    });
    vi.unstubAllGlobals();
  });
});

describe("NFC detector", () => {
  it("handles unsupported, aborted, timeout, and text-record reads", async () => {
    vi.stubGlobal("NDEFReader", undefined);
    expect(isNfcSupported()).toBe(false);
    await expect(readNfcContext()).resolves.toMatchObject({
      ok: false,
      error: { detector: "nfc", code: "UNSUPPORTED" },
    });

    let reader: FakeNfcReader | undefined;
    class FakeNfcReader {
      onreading:
        | ((event: {
            message: { records: ReadonlyArray<{ recordType: string; data?: DataView }> };
          }) => void)
        | null = null;
      onreadingerror: ((event: Event) => void) | null = null;
      scan = vi.fn(async () => {
        await Promise.resolve();
        reader = this;
        this.onreading?.({
          message: {
            records: [
              {
                recordType: "text",
                data: new TextEncoder().encode("tag-1") as unknown as DataView,
              },
            ],
          },
        });
      });
    }
    vi.stubGlobal("NDEFReader", FakeNfcReader);
    const success = await readNfcContext({ timeout: 100 });
    expect(success).toMatchObject({ ok: true, value: { type: "nfc", tagId: "tag-1" } });
    expect(reader?.scan).toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    await expect(readNfcContext({ signal: controller.signal })).resolves.toMatchObject({
      ok: false,
      error: { code: "ABORTED" },
    });
    await expect(readNfcContext({ timeout: -1 })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_DATA" },
    });
    vi.unstubAllGlobals();
  });
});

describe("QR detector", () => {
  it("reports unsupported and invalid options before accessing the camera", async () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    vi.stubGlobal("navigator", { mediaDevices: undefined });
    expect(isQrSupported()).toBe(false);
    await expect(readQrContext({} as HTMLVideoElement)).resolves.toMatchObject({
      ok: false,
      error: { detector: "qr", code: "UNSUPPORTED" },
    });

    vi.stubGlobal("BarcodeDetector", class {});
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
    await expect(readQrContext({} as HTMLVideoElement, { timeout: -1 })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_DATA" },
    });
    vi.unstubAllGlobals();
  });

  it("reads a QR token and always stops the camera stream", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const detect = vi.fn(async () => [{ rawValue: "qr-token" }]);
    class FakeBarcodeDetector {
      detect = detect;
    }
    const video = {
      play: vi.fn(async () => undefined),
      srcObject: null,
      muted: false,
      playsInline: false,
    } as unknown as HTMLVideoElement;
    vi.stubGlobal("BarcodeDetector", FakeBarcodeDetector);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
    await expect(readQrContext(video, { timeout: 100 })).resolves.toEqual({
      ok: true,
      value: { type: "qr", token: "qr-token" },
    });
    expect(video.play).toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    vi.unstubAllGlobals();
  });
});
