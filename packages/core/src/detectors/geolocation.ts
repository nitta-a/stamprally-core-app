import type { DetectorResult, GeoVerificationContext } from "./types.js";
import { createDetectorError } from "./types.js";

export interface GeoDetectorOptions {
  readonly enableHighAccuracy?: boolean;
  readonly timeout?: number;
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && navigator.geolocation !== undefined;
}

export function getCurrentGeoContext(
  options: GeoDetectorOptions = {},
): Promise<DetectorResult<GeoVerificationContext>> {
  if (!isGeolocationSupported()) {
    return Promise.resolve({
      ok: false,
      error: createDetectorError(
        "geolocation",
        "UNSUPPORTED",
        "Geolocation is not supported in this environment.",
      ),
    });
  }
  if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout < 0)) {
    return Promise.resolve({
      ok: false,
      error: createDetectorError(
        "geolocation",
        "INVALID_DATA",
        "Geolocation timeout must be a non-negative finite number.",
      ),
    });
  }

  const positionOptions: PositionOptions = {
    ...(options.enableHighAccuracy === undefined
      ? {}
      : { enableHighAccuracy: options.enableHighAccuracy }),
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  };

  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const currentLatitude = position.coords.latitude;
          const currentLongitude = position.coords.longitude;
          if (
            !Number.isFinite(currentLatitude) ||
            currentLatitude < -90 ||
            currentLatitude > 90 ||
            !Number.isFinite(currentLongitude) ||
            currentLongitude < -180 ||
            currentLongitude > 180
          ) {
            resolve({
              ok: false,
              error: createDetectorError(
                "geolocation",
                "INVALID_DATA",
                "Geolocation returned invalid coordinates.",
              ),
            });
            return;
          }
          resolve({
            ok: true,
            value: { type: "geo", currentLatitude, currentLongitude },
          });
        },
        (error) => {
          const code =
            error.code === 1
              ? "PERMISSION_DENIED"
              : error.code === 2
                ? "POSITION_UNAVAILABLE"
                : error.code === 3
                  ? "TIMEOUT"
                  : "READ_FAILED";
          resolve({
            ok: false,
            error: createDetectorError(
              "geolocation",
              code,
              `Geolocation failed: ${error.message || code}.`,
              error,
            ),
          });
        },
        positionOptions,
      );
    } catch (error) {
      resolve({
        ok: false,
        error: createDetectorError(
          "geolocation",
          "READ_FAILED",
          "Geolocation failed before a position could be requested.",
          error,
        ),
      });
    }
  });
}
