import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  ClaimOptions,
  LocaleDictionary,
  PublicReward,
  RallyInventoryState,
  RewardState,
  StampRallyProgress,
} from "@stamprally/core";
import { getRewardAvailability, resolveLocalizedText } from "@stamprally/core";
import { type ReactNode, useId, useRef, useState } from "react";
import type { MuiSx } from "./index.js";
import { resolveMuiLabel } from "./locales.js";

export interface MuiCompletionPanelProps<TLocale extends string = string> {
  readonly progress: StampRallyProgress;
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly rewardStates: ReadonlyArray<RewardState>;
  readonly inventory?: RallyInventoryState;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onViewReward?: (rewardId: string) => void;
  readonly onClaimReward?: (rewardId: string, options?: ClaimOptions) => unknown;
  readonly sx?: MuiSx;
}

export function MuiCompletionPanel<TLocale extends string = string>({
  progress,
  rewards,
  rewardStates,
  inventory,
  locale,
  dictionary,
  onViewReward,
  onClaimReward,
  sx,
}: MuiCompletionPanelProps<TLocale>): ReactNode {
  const [selected, setSelected] = useState<PublicReward<TLocale> | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [staffPasscode, setStaffPasscode] = useState("");
  const claimingRef = useRef(false);
  const dialogId = useId();
  const claim = async (): Promise<void> => {
    if (selected === null || onClaimReward === undefined || claimingRef.current) return;
    claimingRef.current = true;
    setClaiming(true);
    setFailed(false);
    try {
      const options =
        selected.redemptionMethod === "staff_passcode"
          ? { staffPasscode: staffPasscode.trim() }
          : undefined;
      const result = await (options === undefined
        ? onClaimReward(selected.id)
        : onClaimReward(selected.id, options));
      if (typeof result === "object" && result !== null && "ok" in result && result.ok === false)
        setFailed(true);
      else {
        setStaffPasscode("");
        setSelected(null);
      }
    } catch {
      setFailed(true);
    } finally {
      claimingRef.current = false;
      setClaiming(false);
    }
  };
  const availableRewards = rewards.filter((reward) => {
    const state = rewardStates.find((item) => item.rewardId === reward.id);
    return getRewardAvailability(reward, state, inventory).available;
  });
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
                {onViewReward !== undefined && reward.redemptionMethod === "view_only" && (
                  <Button onClick={() => onViewReward(reward.id)}>
                    {resolveMuiLabel(dictionary, locale, "completion.viewReward", "View reward")}
                  </Button>
                )}
                {onClaimReward !== undefined && reward.redemptionMethod !== "view_only" && (
                  <Button
                    onClick={() => {
                      setFailed(false);
                      setStaffPasscode("");
                      setSelected(reward);
                    }}
                  >
                    {resolveMuiLabel(dictionary, locale, "reward.redeem", "Redeem reward")}
                  </Button>
                )}
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
      <Dialog
        open={selected !== null}
        onClose={() => {
          if (!claiming) {
            setStaffPasscode("");
            setSelected(null);
          }
        }}
        aria-labelledby={dialogId}
      >
        <DialogTitle id={dialogId}>
          {resolveMuiLabel(dictionary, locale, "reward.redeemTitle", "Redeem {reward}?").replace(
            "{reward}",
            selected === null ? "" : resolveLocalizedText(selected.title, locale),
          )}
        </DialogTitle>
        <DialogContent>
          {resolveMuiLabel(
            dictionary,
            locale,
            "reward.redeemWarning",
            "Once redeemed, this reward may not be available again.",
          )}
          {selected?.redemptionMethod === "staff_passcode" && (
            <TextField
              label={resolveMuiLabel(
                dictionary,
                locale,
                "redemption.staffPasscode",
                "Staff passcode",
              )}
              type="password"
              autoComplete="off"
              value={staffPasscode}
              onChange={(event) => setStaffPasscode(event.target.value)}
              disabled={claiming}
            />
          )}
          {failed && (
            <Alert severity="error" role="alert">
              {resolveMuiLabel(
                dictionary,
                locale,
                "reward.claimFailed",
                "Could not redeem this reward. Please try again.",
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={claiming}
            onClick={() => {
              setStaffPasscode("");
              setSelected(null);
            }}
          >
            {resolveMuiLabel(dictionary, locale, "redemption.cancel", "Cancel")}
          </Button>
          <Button
            disabled={
              claiming || (selected?.redemptionMethod === "staff_passcode" && !staffPasscode.trim())
            }
            variant="contained"
            onClick={() => void claim()}
          >
            {resolveMuiLabel(dictionary, locale, "redemption.confirm", "Confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
