import { Alert, LinearProgress, Stack } from "@mui/material";
import {
  calculateDistanceMeters,
  type GeoCoordinates,
  type LocaleDictionary,
} from "@stamprally/core";
import type { ReactNode } from "react";
import { type BuiltInMuiLocale, DEFAULT_MUI_DICTIONARY } from "./locales.js";

export interface MuiGpsProximityMeterProps<TLocale extends string = BuiltInMuiLocale> {
  readonly currentPosition?: GeoCoordinates;
  readonly currentLocation?: GeoCoordinates;
  readonly targetPosition?: GeoCoordinates;
  readonly targetLocation?: GeoCoordinates;
  readonly radiusMeters?: number;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
}

function text<TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string {
  return (
    dictionary?.[locale]?.[key] ??
    DEFAULT_MUI_DICTIONARY[locale as BuiltInMuiLocale]?.[key] ??
    fallback
  );
}

export function MuiGpsProximityMeter<TLocale extends string = BuiltInMuiLocale>({
  currentPosition,
  currentLocation,
  targetPosition,
  targetLocation,
  radiusMeters,
  locale = "en" as TLocale,
  dictionary,
}: MuiGpsProximityMeterProps<TLocale>): ReactNode {
  const current = currentPosition ?? currentLocation;
  const target = targetPosition ?? targetLocation;
  const distance =
    current !== undefined && target !== undefined
      ? calculateDistanceMeters(
          current.latitude,
          current.longitude,
          target.latitude,
          target.longitude,
        )
      : undefined;
  const within = distance !== undefined && radiusMeters !== undefined && distance <= radiusMeters;
  const message =
    distance === undefined
      ? text(dictionary, locale, "gps.unavailable", "Current location is unavailable")
      : within
        ? text(dictionary, locale, "gps.within", "You are inside the check-in area")
        : text(dictionary, locale, "gps.distance", "About {distance} m to the destination").replace(
            "{distance}",
            Math.round(distance).toLocaleString(),
          );
  const value =
    distance === undefined || radiusMeters === undefined
      ? 0
      : Math.max(0, Math.min(100, ((radiusMeters - distance) / radiusMeters) * 100));
  return (
    <Stack spacing={0.5} role="status" aria-live="polite">
      <LinearProgress variant="determinate" value={value} />
      <Alert severity={within ? "success" : distance === undefined ? "info" : "warning"}>
        {message}
      </Alert>
    </Stack>
  );
}

export const GpsProximityMeter = MuiGpsProximityMeter;
