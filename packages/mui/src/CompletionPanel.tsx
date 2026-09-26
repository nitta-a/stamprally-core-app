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
import { resolveMuiLabel } from "./locales.js";

export interface MuiCompletionPanelProps<TLocale extends string = string> {
  readonly progress: StampRallyProgress;
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly rewardStates: ReadonlyArray<RewardState>;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onViewReward?: (rewardId: string) => void;
  readonly onClaimReward?: (rewardId: string) => void;
  readonly sx?: MuiSx;
}

export function MuiCompletionPanel<TLocale extends string = string>({
  progress,
  rewards,
  rewardStates,
  locale,
  dictionary,
  onViewReward,
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
      aria-label={resolveMuiLabel(dictionary, locale, "completion.title", "Rally complete")}
    >
      <Stack spacing={1}>
        <Typography variant="h5" component="h2">
          {resolveMuiLabel(dictionary, locale, "completion.title", "Stamp rally complete!")}
        </Typography>
        <Typography>
          {resolveMuiLabel(
            dictionary,
            locale,
            "completion.description",
            "You completed {acquired} required spots.",
          ).replace("{acquired}", String(progress.completionRequired))}
        </Typography>
        {availableRewards.length > 0 && (
          <Stack spacing={1}>
            <Typography>
              {resolveMuiLabel(
                dictionary,
                locale,
                "completion.rewardAvailable",
                "A reward is available",
              )}
            </Typography>
            {availableRewards.map((reward) => (
              <Stack direction="row" spacing={1} alignItems="center" key={reward.id}>
                <Typography>{resolveLocalizedText(reward.title, locale)}</Typography>
                {onViewReward !== undefined && (
                  <Button onClick={() => onViewReward(reward.id)}>
                    {resolveMuiLabel(dictionary, locale, "completion.viewReward", "View reward")}
                  </Button>
                )}
                {onClaimReward !== undefined && reward.redemptionMethod !== "view_only" && (
                  <Button onClick={() => onClaimReward(reward.id)}>
                    {resolveMuiLabel(dictionary, locale, "reward.redeem", "Redeem reward")}
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
