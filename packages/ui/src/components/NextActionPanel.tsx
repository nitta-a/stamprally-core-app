import type { GeoCoordinates, LocaleDictionary, NextSpotSuggestion } from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import type { ReactElement } from "react";
import { resolveUiLabel } from "../locales/index.js";

export interface NextActionPanelProps<TLocale extends string = string> {
  readonly suggestions: ReadonlyArray<NextSpotSuggestion>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly currentLocation?: GeoCoordinates;
  readonly onNavigate?: (suggestion: NextSpotSuggestion) => void;
  readonly maxSuggestions?: number;
  readonly className?: string;
}

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
  const remainingCount = Math.max(0, suggestions.length - 1);
  return (
    <section
      className={["sry-next-action", className].filter(Boolean).join(" ")}
      aria-label={resolveUiLabel(dictionary, locale, "nextAction.title", "Next spots")}
    >
      <h2>{resolveUiLabel(dictionary, locale, "nextAction.title", "Next spots")}</h2>
      {visible.length === 0 ? (
        <p>
          {resolveUiLabel(dictionary, locale, "nextAction.noAvailableSpots", "No available spots")}
        </p>
      ) : (
        <>
          {primary === undefined ? null : (
            <article className="sry-next-action__primary">
              <strong>{resolveLocalizedText(primary.spot.name, locale)}</strong>
              {primary.availabilityStatus !== undefined && (
                <span role="status">
                  {resolveUiLabel(
                    dictionary,
                    locale,
                    `availability.${primary.availabilityStatus.toLowerCase()}`,
                    primary.availabilityStatus,
                  )}
                </span>
              )}
              {primary.distanceMeters === undefined ? null : (
                <span>
                  {resolveUiLabel(
                    dictionary,
                    locale,
                    "nextAction.distance",
                    "About {distance} m",
                  ).replace("{distance}", String(Math.round(primary.distanceMeters)))}
                </span>
              )}
              {onNavigate !== undefined && primary.spot.location !== undefined && (
                <button type="button" onClick={() => onNavigate(primary)}>
                  {resolveUiLabel(dictionary, locale, "nextAction.navigate", "View directions")}
                </button>
              )}
            </article>
          )}
          {secondary.length > 0 && (
            <details>
              <summary>
                {resolveUiLabel(
                  dictionary,
                  locale,
                  "nextAction.otherSpots",
                  "Other available spots",
                )}{" "}
                ({remainingCount})
              </summary>
              <ul>
                {secondary.map((suggestion) => (
                  <li key={suggestion.spot.id}>
                    <span>{resolveLocalizedText(suggestion.spot.name, locale)}</span>
                    {suggestion.availabilityStatus !== undefined && (
                      <span role="status">
                        {resolveUiLabel(
                          dictionary,
                          locale,
                          `availability.${suggestion.availabilityStatus.toLowerCase()}`,
                          suggestion.availabilityStatus,
                        )}
                      </span>
                    )}
                    {onNavigate !== undefined && suggestion.spot.location !== undefined && (
                      <button type="button" onClick={() => onNavigate(suggestion)}>
                        {resolveUiLabel(
                          dictionary,
                          locale,
                          "nextAction.navigate",
                          "View directions",
                        )}
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
