import { Box, Button, Stack, Typography } from "@mui/material";
import type { GeoCoordinates, LocaleDictionary, NextSpotSuggestion } from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import type { ReactNode } from "react";
import type { MuiSx } from "./index.js";
import { resolveMuiLabel } from "./locales.js";

export interface MuiNextActionPanelProps<TLocale extends string = string> {
  readonly suggestions: ReadonlyArray<NextSpotSuggestion>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly currentLocation?: GeoCoordinates;
  readonly onNavigate?: (suggestion: NextSpotSuggestion) => void;
  readonly maxSuggestions?: number;
  readonly sx?: MuiSx;
}

export function MuiNextActionPanel<TLocale extends string = string>({
  suggestions,
  locale,
  dictionary,
  onNavigate,
  maxSuggestions = 3,
  sx,
}: MuiNextActionPanelProps<TLocale>): ReactNode {
  const visible = suggestions.slice(0, Math.max(0, maxSuggestions));
  const [primary, ...secondary] = visible;
  const remainingCount = Math.max(0, suggestions.length - 1);
  return (
    <Box
      {...(sx === undefined ? {} : { sx })}
      component="section"
      aria-label={resolveMuiLabel(dictionary, locale, "nextAction.title", "Next spots")}
    >
      <Stack spacing={1}>
        <Typography variant="h5" component="h2">
          {resolveMuiLabel(dictionary, locale, "nextAction.title", "Next spots")}
        </Typography>
        {visible.length === 0 ? (
          <Typography>
            {resolveMuiLabel(
              dictionary,
              locale,
              "nextAction.noAvailableSpots",
              "No available spots",
            )}
          </Typography>
        ) : (
          <>
            {primary === undefined ? null : (
              <Stack
                spacing={0.5}
                sx={{ p: 1, border: 2, borderColor: "currentColor", borderRadius: 1 }}
              >
                <Typography fontWeight="bold">
                  {resolveLocalizedText(primary.spot.name, locale)}
                </Typography>
                {primary.availabilityStatus !== undefined && (
                  <Typography role="status">
                    {resolveMuiLabel(
                      dictionary,
                      locale,
                      `availability.${primary.availabilityStatus.toLowerCase()}`,
                      primary.availabilityStatus,
                    )}
                  </Typography>
                )}
                {primary.distanceMeters === undefined ? null : (
                  <Typography variant="body2">
                    {resolveMuiLabel(
                      dictionary,
                      locale,
                      "nextAction.distance",
                      "About {distance} m",
                    ).replace("{distance}", String(Math.round(primary.distanceMeters)))}
                  </Typography>
                )}
                {onNavigate !== undefined && primary.spot.location !== undefined && (
                  <Button size="small" onClick={() => onNavigate(primary)}>
                    {resolveMuiLabel(dictionary, locale, "nextAction.navigate", "View directions")}
                  </Button>
                )}
              </Stack>
            )}
            {secondary.length > 0 && (
              <details>
                <summary>
                  {resolveMuiLabel(
                    dictionary,
                    locale,
                    "nextAction.otherSpots",
                    "Other available spots",
                  )}{" "}
                  ({remainingCount})
                </summary>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {secondary.map((suggestion) => (
                    <Stack direction="row" spacing={1} alignItems="center" key={suggestion.spot.id}>
                      <Typography>{resolveLocalizedText(suggestion.spot.name, locale)}</Typography>
                      {suggestion.availabilityStatus !== undefined && (
                        <Typography role="status">
                          {resolveMuiLabel(
                            dictionary,
                            locale,
                            `availability.${suggestion.availabilityStatus.toLowerCase()}`,
                            suggestion.availabilityStatus,
                          )}
                        </Typography>
                      )}
                      {onNavigate !== undefined && suggestion.spot.location !== undefined && (
                        <Button size="small" onClick={() => onNavigate(suggestion)}>
                          {resolveMuiLabel(
                            dictionary,
                            locale,
                            "nextAction.navigate",
                            "View directions",
                          )}
                        </Button>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </details>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
}
