import { Box, Button, Stack, Typography } from "@mui/material";
import type {
  LocaleDictionary,
  PublicReward,
  RewardState,
  StampRallyProgress,
} from "@stamprally/core";
import { resolveLocalizedText } from "@stamprally/core";
import type { ReactNode } from "react";
import type { MuiSx } from "./index.js";

export interface MuiCompletionPanelProps<TLocale extends string = string> {
  readonly progress: StampRallyProgress;
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly rewardStates: ReadonlyArray<RewardState>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onClaimReward?: (rewardId: string) => void;
  readonly sx?: MuiSx;
}

const label = <TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string => dictionary?.[locale]?.[key] ?? fallback;

export function MuiCompletionPanel<TLocale extends string = string>({
  progress,
  rewards,
  rewardStates,
  locale,
  dictionary,
  onClaimReward,
  sx,
}: MuiCompletionPanelProps<TLocale>): ReactNode {
  const availableRewards = rewards.filter((reward) =>
    rewardStates.some((state) => state.rewardId === reward.id && state.status === "AVAILABLE"),
  );
  return (
    <Box
      {...(sx === undefined ? {} : { sx })}
      component="section"
      aria-live="polite"
      aria-label={label(dictionary, locale, "completion.title", "Rally complete")}
    >
      <Stack spacing={1}>
        <Typography variant="h5" component="h2">
          {label(dictionary, locale, "completion.title", "Stamp rally complete!")}
        </Typography>
        <Typography>
          {label(
            dictionary,
            locale,
            "completion.description",
            "You completed {acquired} required spots.",
          ).replace("{acquired}", String(progress.completionRequired))}
        </Typography>
        {availableRewards.length > 0 && (
          <Stack spacing={1}>
            <Typography>
              {label(dictionary, locale, "completion.rewardAvailable", "A reward is available")}
            </Typography>
            {availableRewards.map((reward) => (
              <Stack direction="row" spacing={1} alignItems="center" key={reward.id}>
                <Typography>{resolveLocalizedText(reward.title, locale)}</Typography>
                {onClaimReward === undefined ? null : (
                  <Button onClick={() => onClaimReward(reward.id)}>
                    {label(dictionary, locale, "completion.viewReward", "View reward")}
                  </Button>
                )}
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
