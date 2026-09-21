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
  const [primary, ...secondary] = visible;
  return (
    <section
      className={["sry-next-action", className].filter(Boolean).join(" ")}
      aria-label={label(dictionary, locale, "nextAction.title", "Next spots")}
    >
      <h2>{label(dictionary, locale, "nextAction.title", "Next spots")}</h2>
      {visible.length === 0 ? (
        <p>{label(dictionary, locale, "nextAction.noAvailableSpots", "No available spots")}</p>
      ) : (
        <>
          {primary === undefined ? null : (
            <article className="sry-next-action__primary">
              <strong>{resolveLocalizedText(primary.spot.name, locale)}</strong>
              {primary.distanceMeters === undefined ? null : (
                <span>
                  {label(dictionary, locale, "nextAction.distance", "About {distance} m").replace(
                    "{distance}",
                    String(Math.round(primary.distanceMeters)),
                  )}
                </span>
              )}
              {onNavigate === undefined ? null : (
                <button type="button" onClick={() => onNavigate(primary)}>
                  {label(dictionary, locale, "nextAction.navigate", "View directions")}
                </button>
              )}
            </article>
          )}
          {secondary.length > 0 && (
            <details>
              <summary>
                {label(dictionary, locale, "nextAction.otherSpots", "Other available spots")} (
                {secondary.length})
              </summary>
              <ul>
                {secondary.map((suggestion) => (
                  <li key={suggestion.spot.id}>
                    <span>{resolveLocalizedText(suggestion.spot.name, locale)}</span>
                    {onNavigate === undefined ? null : (
                      <button type="button" onClick={() => onNavigate(suggestion)}>
                        {label(dictionary, locale, "nextAction.navigate", "View directions")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
