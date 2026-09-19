import type { GeoCoordinates, LocaleDictionary, NextSpotSuggestion } from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import type { ReactElement } from "react";

export interface NextActionPanelProps<TLocale extends string = string> {
  readonly suggestions: ReadonlyArray<NextSpotSuggestion>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly currentLocation?: GeoCoordinates;
  readonly onNavigate?: (suggestion: NextSpotSuggestion) => void;
  readonly maxSuggestions?: number;
  readonly className?: string;
}

const label = <TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string => dictionary?.[locale]?.[key] ?? fallback;

export function NextActionPanel<TLocale extends string = string>({
  suggestions,
  locale,
  dictionary,
  onNavigate,
  maxSuggestions = 3,
  className,
}: NextActionPanelProps<TLocale>): ReactElement {
  const visible = suggestions.slice(0, Math.max(0, maxSuggestions));
  return (
    <section
      className={className}
      aria-label={label(dictionary, locale, "nextAction.title", "Next spots")}
    >
      <h2>{label(dictionary, locale, "nextAction.title", "Next spots")}</h2>
      {visible.length === 0 ? (
        <p>{label(dictionary, locale, "nextAction.noAvailableSpots", "No available spots")}</p>
      ) : (
        <ul>
          {visible.map((suggestion) => {
            const { spot, distanceMeters } = suggestion;
            return (
              <li key={spot.id}>
                <span>{resolveLocalizedText(spot.name, locale)}</span>
                {distanceMeters === undefined ? null : (
                  <span>
                    {label(dictionary, locale, "nextAction.distance", "About {distance} m").replace(
                      "{distance}",
                      String(Math.round(distanceMeters)),
                    )}
                  </span>
                )}
                {onNavigate === undefined ? null : (
                  <button type="button" onClick={() => onNavigate(suggestion)}>
                    {label(dictionary, locale, "nextAction.navigate", "View directions")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
