import {
  calculateDistanceMeters,
  type GeoCoordinates,
  type LocaleDictionary,
} from "@stamprally/core";
import type { CSSProperties, ReactElement } from "react";
import { type BuiltInUiLocale, DEFAULT_UI_DICTIONARY } from "../locales/index.js";

export interface GpsProximityMeterProps<TLocale extends string = BuiltInUiLocale> {
  readonly currentPosition?: GeoCoordinates;
  readonly currentLocation?: GeoCoordinates;
  readonly targetPosition?: GeoCoordinates;
  readonly targetLocation?: GeoCoordinates;
  readonly radiusMeters?: number;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly className?: string;
  readonly style?: CSSProperties;
}

function text<TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string {
  return (
    dictionary?.[locale]?.[key] ??
    DEFAULT_UI_DICTIONARY[locale as BuiltInUiLocale]?.[key] ??
    fallback
  );
}

function formatDistance(distance: number): string {
  if (distance < 10) return distance.toFixed(1);
  return Math.round(distance).toLocaleString();
}

/** Shows live-friendly distance feedback for a GPS check-in target. */
export function GpsProximityMeter<TLocale extends string = BuiltInUiLocale>({
  currentPosition,
  currentLocation,
  targetPosition,
  targetLocation,
  radiusMeters,
  locale = "en" as TLocale,
  dictionary,
  className,
  style,
}: GpsProximityMeterProps<TLocale>): ReactElement {
  const current = currentPosition ?? currentLocation;
  const target = targetPosition ?? targetLocation;
  const hasCoordinates = current !== undefined && target !== undefined;
  const distance = hasCoordinates
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
            formatDistance(distance),
          );
  const percentage =
    distance === undefined || radiusMeters === undefined
      ? 0
      : Math.max(0, Math.min(100, ((radiusMeters - distance) / radiusMeters) * 100));
  return (
    <div className={className} style={style} role="status" aria-live="polite">
      <div aria-hidden="true" className="gps-proximity-meter__track">
        <div className="gps-proximity-meter__fill" style={{ width: `${percentage}%` }} />
      </div>
      <span className="gps-proximity-meter__message">{message}</span>
    </div>
  );
}
