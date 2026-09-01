"use client";

import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LockIcon from "@mui/icons-material/Lock";
import RedeemIcon from "@mui/icons-material/Redeem";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { UseAdminRallyEditorReturn } from "@stamprally/admin-ui";
import { useAdminRallyEditor } from "@stamprally/admin-ui";

import type {
  AdminRallyConfig,
  CheckInCondition,
  LocaleDictionary,
  LocalizedText,
  PublicRallyConfig,
  PublicReward,
  PublicSpotItem,
  Reward,
  RewardState,
  SheetTheme,
  SpotItem,
  SpotStatus,
  StampRallyState,
  SupportedLocale,
} from "@stamprally/core";
import {
  calculateProgress,
  DEFAULT_SHEET_THEME,
  evaluateSpotStatus,
  resolveLocalizedText,
  updateLocalizedField,
  validateLocalizationCompleteness,
} from "@stamprally/core";
import type { UseStampRallyReturn, UseStampRallySyncState } from "@stamprally/react";
import type { ChangeEvent, ElementType, ReactNode, SyntheticEvent } from "react";
import { useEffect, useState } from "react";

export type { MuiAccountBackupBannerProps } from "./AccountBackupBanner.js";
export { MuiAccountBackupBanner } from "./AccountBackupBanner.js";
export type { MuiCloudSyncButtonProps } from "./CloudSyncButton.js";
export { MuiCloudSyncButton } from "./CloudSyncButton.js";
export type { MuiGpsProximityMeterProps } from "./GpsProximityMeter.js";
export {
  MuiGpsProximityMeter,
  MuiGpsProximityMeter as GpsProximityMeter,
} from "./GpsProximityMeter.js";
export type { BuiltInMuiLocale } from "./locales.js";
export { DEFAULT_MUI_DICTIONARY, MUI_DICTIONARIES } from "./locales.js";
export type { MuiStaffRedemptionViewProps } from "./StaffRedemptionView.js";
export {
  MuiStaffRedemptionView,
  MuiStaffRedemptionView as StaffRedemptionView,
} from "./StaffRedemptionView.js";

export type MuiSlot = ElementType;
export type MuiSlotProps = Readonly<Record<string, Record<string, unknown> | undefined>>;
export type MuiSx = SxProps<Theme>;

export type MuiRallyAdapter = Pick<
  UseStampRallyReturn,
  | "config"
  | "state"
  | "isLoading"
  | "error"
  | "onCheckIn"
  | "onClaimReward"
  | "onSync"
  | "syncState"
> & {
  readonly subscribe?: (listener: (state: StampRallyState) => void) => () => void;
};

export interface MuiSpotCardProps<TLocale extends string = SupportedLocale> {
  readonly spot: PublicSpotItem<TLocale>;
  readonly state: StampRallyState;
  readonly status: SpotStatus;
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onCheckIn?: (spotId: string, proof: unknown) => unknown;
  readonly sx?: MuiSx;
  readonly slots?: {
    readonly root?: MuiSlot;
    readonly media?: MuiSlot;
    readonly content?: MuiSlot;
    readonly actions?: MuiSlot;
    readonly statusIcon?: MuiSlot;
    readonly button?: MuiSlot;
  };
  readonly slotProps?: MuiSlotProps;
}

export interface MuiSpotGridProps<TLocale extends string = SupportedLocale> {
  readonly spots: ReadonlyArray<PublicSpotItem<TLocale>>;
  readonly state: StampRallyState;
  readonly verifyingSpotId?: string;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onCheckIn?: (spotId: string, proof: unknown) => unknown;
  readonly sx?: MuiSx;
  readonly slots?: { readonly root?: MuiSlot; readonly item?: MuiSlot };
  readonly slotProps?: MuiSlotProps;
  readonly renderSpotCard?: (props: MuiSpotCardProps<TLocale>) => ReactNode;
}

export interface MuiRewardCardProps<TLocale extends string = SupportedLocale> {
  readonly reward: PublicReward<TLocale>;
  readonly state?: RewardState;
  readonly inventory?: StampRallyState["inventory"];
  readonly locale: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onClaim?: (rewardId: string) => unknown;
  readonly sx?: MuiSx;
  readonly slots?: {
    readonly root?: MuiSlot;
    readonly content?: MuiSlot;
    readonly actions?: MuiSlot;
    readonly dialog?: MuiSlot;
    readonly button?: MuiSlot;
  };
  readonly slotProps?: MuiSlotProps;
}

export interface MuiRewardListProps<TLocale extends string = SupportedLocale> {
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly state: StampRallyState;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly onClaim?: (rewardId: string) => unknown;
  readonly sx?: MuiSx;
  readonly slots?: { readonly root?: MuiSlot; readonly item?: MuiSlot };
  readonly slotProps?: MuiSlotProps;
  readonly renderRewardCard?: (props: MuiRewardCardProps<TLocale>) => ReactNode;
}

export interface MuiSyncStatusBannerProps {
  readonly status: Pick<UseStampRallySyncState, "isSyncing" | "pendingCount" | "rejectedHistory">;
  readonly locale?: string;
  readonly dictionary?: LocaleDictionary<string>;
  readonly sx?: MuiSx;
  readonly autoHideDuration?: number | null;
  readonly slots?: { readonly snackbar?: MuiSlot; readonly alert?: MuiSlot };
  readonly slotProps?: MuiSlotProps;
}

export interface MuiRallyViewerProps<TLocale extends string = SupportedLocale> {
  readonly config?: PublicRallyConfig<TLocale>;
  readonly adapter?: MuiRallyAdapter;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly sx?: MuiSx;
  readonly showSyncStatus?: boolean;
  readonly slots?: {
    readonly root?: MuiSlot;
    readonly header?: MuiSlot;
    readonly progress?: MuiSlot;
    readonly spotGrid?: MuiSlot;
    readonly rewardList?: MuiSlot;
    readonly syncStatusBanner?: MuiSlot;
  };
  readonly slotProps?: MuiSlotProps;
  readonly renderSpotCard?: (props: MuiSpotCardProps<TLocale>) => ReactNode;
  readonly renderRewardCard?: (props: MuiRewardCardProps<TLocale>) => ReactNode;
  readonly onStampStamped?: (spot: SpotItem<TLocale>) => void;
}

export interface MuiLocalizationSplitPreviewProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly locales: ReadonlyArray<TLocale>;
  readonly onChange?: (config: AdminRallyConfig<TLocale, TMeta>) => void;
  readonly dictionary?: LocaleDictionary<TLocale>;
}

export function MuiLocalizationSplitPreview<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  config,
  locales,
  onChange,
  dictionary,
}: MuiLocalizationSplitPreviewProps<TLocale, TMeta>): ReactNode {
  const warnings = validateLocalizationCompleteness(config, locales);
  const labelLocale = locales[0] ?? ("en" as TLocale);
  const label = (key: string, fallback: string): string =>
    dictionary?.[labelLocale]?.[key] ?? fallback;
  const update = (
    spotId: string,
    locale: TLocale,
    field: "name" | "description" | "hint",
    value: string,
  ): void => {
    if (onChange === undefined) return;
    onChange({
      ...config,
      spots: config.spots.map((spot) =>
        spot.id === spotId
          ? { ...spot, [field]: updateLocalizedField(spot[field], locale, value) }
          : spot,
      ),
    });
  };
  return (
    <Stack spacing={2} aria-label={label("localizationPreview", "Localization preview")}>
      <Typography variant="h5" component="h2">
        {label("localizationPreview", "Localization preview")}
      </Typography>
      {warnings.length > 0 && (
        <Alert severity="warning">{warnings.length} translation(s) need attention.</Alert>
      )}
      {config.spots.map((spot) => (
        <Box key={spot.id}>
          <Typography variant="subtitle1">{spot.id}</Typography>
          <Grid container spacing={1}>
            {locales.map((locale) => (
              <Grid
                item
                xs={12}
                md={12 / Math.max(1, Math.min(4, locales.length))}
                key={`${spot.id}-${locale}`}
              >
                <Stack spacing={1}>
                  <Typography variant="caption">{locale}</Typography>
                  {(["name", "description", "hint"] as const).map((field) => (
                    <TextField
                      key={field}
                      size="small"
                      label={field}
                      value={localized(spot[field], locale)}
                      disabled={onChange === undefined}
                      onChange={(event) => update(spot.id, locale, field, event.target.value)}
                    />
                  ))}
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Stack>
  );
}

function localized<TLocale extends string>(
  value: LocalizedText<TLocale> | undefined,
  locale: TLocale,
) {
  return resolveLocalizedText(value ?? "", locale);
}

function muiLabel<TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string {
  return dictionary?.[locale]?.[key] ?? fallback;
}

function defaultState(rallyId: string): StampRallyState {
  return { rallyId, userId: null, records: [], rewards: [], updatedAt: "" };
}

export function MuiSpotCard<TLocale extends string = SupportedLocale>({
  spot,
  state,
  status,
  locale,
  dictionary,
  onCheckIn,
  sx,
  slots,
  slotProps,
}: MuiSpotCardProps<TLocale>): ReactNode {
  const Root = slots?.root ?? Card;
  const Media = slots?.media ?? CardMedia;
  const Content = slots?.content ?? CardContent;
  const Actions = slots?.actions ?? CardActions;
  const StatusIcon = slots?.statusIcon;
  const ButtonSlot = slots?.button ?? Button;
  const locked = status === "LOCKED";
  const claimed = status === "CLAIMED";
  const verifying = status === "VERIFYING";
  const rootProps = slotProps?.root ?? {};
  const mediaProps = slotProps?.media ?? {};
  const contentProps = slotProps?.content ?? {};
  const actionsProps = slotProps?.actions ?? {};
  const buttonProps = slotProps?.button ?? {};
  const defaultIcon = locked ? <LockIcon /> : claimed ? <CheckCircleIcon /> : null;
  const icon =
    StatusIcon === undefined ? defaultIcon : <StatusIcon {...(slotProps?.statusIcon ?? {})} />;
  return (
    <Root
      {...rootProps}
      sx={sx}
      data-status={status}
      aria-disabled={locked}
      variant="outlined"
      data-stamp-count={state.records.length}
    >
      {spot.imageUrl !== undefined && (
        <Media {...mediaProps} component="img" image={spot.imageUrl} alt="" />
      )}
      <Content {...contentProps}>
        <Stack direction="row" spacing={1} alignItems="center">
          {icon}
          <Typography variant="h6" component="h3">
            {localized(spot.name, locale)}
          </Typography>
        </Stack>
        {spot.description !== undefined && (
          <Typography color="text.secondary">{localized(spot.description, locale)}</Typography>
        )}
        {spot.hint !== undefined && (
          <Typography variant="body2">{localized(spot.hint, locale)}</Typography>
        )}
        <Chip
          size="small"
          label={muiLabel(dictionary, locale, `status.${status.toLowerCase()}`, status)}
          color={claimed ? "success" : locked ? "default" : "primary"}
        />
      </Content>
      <Actions {...actionsProps}>
        <ButtonSlot
          {...buttonProps}
          variant={claimed ? "outlined" : "contained"}
          disabled={locked || claimed || verifying || onCheckIn === undefined}
          startIcon={verifying ? <CircularProgress size={16} /> : undefined}
          onClick={() => void onCheckIn?.(spot.id, undefined)}
        >
          {verifying
            ? muiLabel(dictionary, locale, "verifying", "Verifying…")
            : claimed
              ? muiLabel(dictionary, locale, "status.claimed", "Claimed")
              : locked
                ? muiLabel(dictionary, locale, "status.locked", "Locked")
                : muiLabel(dictionary, locale, "checkIn", "Check in")}
        </ButtonSlot>
      </Actions>
    </Root>
  );
}

export function MuiSpotGrid<TLocale extends string = SupportedLocale>({
  spots,
  state,
  verifyingSpotId,
  locale = "en" as TLocale,
  dictionary,
  onCheckIn,
  sx,
  slots,
  slotProps,
  renderSpotCard,
}: MuiSpotGridProps<TLocale>): ReactNode {
  const Root = slots?.root ?? Grid;
  const Item = slots?.item ?? Grid;
  const rootProps = slotProps?.root ?? {};
  const itemProps = slotProps?.item ?? {};
  return (
    <Root {...rootProps} container spacing={2} sx={sx}>
      {spots.map((spot) => {
        const status = evaluateSpotStatus(spot, state, {
          verifying: verifyingSpotId === spot.id,
        });
        const props: MuiSpotCardProps<TLocale> = {
          spot,
          state,
          status,
          locale,
          ...(dictionary === undefined ? {} : { dictionary }),
          ...(onCheckIn === undefined ? {} : { onCheckIn }),
        };
        return (
          <Item {...itemProps} key={spot.id} xs={12} sm={6} md={4}>
            {renderSpotCard?.(props) ?? <MuiSpotCard {...props} />}
          </Item>
        );
      })}
    </Root>
  );
}

function rewardStatus(state: RewardState | undefined): RewardState["status"] {
  return state?.status ?? "LOCKED";
}

export function MuiRewardCard<TLocale extends string = SupportedLocale>({
  reward,
  state,
  inventory,
  locale,
  dictionary,
  onClaim,
  sx,
  slots,
  slotProps,
}: MuiRewardCardProps<TLocale>): ReactNode {
  const [open, setOpen] = useState(false);
  const Root = slots?.root ?? Card;
  const Content = slots?.content ?? CardContent;
  const Actions = slots?.actions ?? CardActions;
  const DialogSlot = slots?.dialog ?? Dialog;
  const ButtonSlot = slots?.button ?? Button;
  const rootProps = slotProps?.root ?? {};
  const status = rewardStatus(state);
  const canClaim = status === "AVAILABLE";
  const remaining = inventory?.rewardRemaining?.[reward.id] ?? reward.stockLimit;
  const claim = (): void => {
    setOpen(false);
    void onClaim?.(reward.id);
  };
  return (
    <>
      <Root {...rootProps} sx={sx} variant="outlined">
        <Content {...(slotProps?.content ?? {})}>
          <Stack direction="row" spacing={1} alignItems="center">
            <RedeemIcon color={canClaim ? "primary" : "disabled"} />
            <Typography variant="h6" component="h3">
              {localized(reward.title, locale)}
            </Typography>
          </Stack>
          {reward.description !== undefined && (
            <Typography color="text.secondary">{localized(reward.description, locale)}</Typography>
          )}
          {remaining !== undefined && <Chip size="small" label={`Stock: ${remaining}`} />}
          <Chip
            size="small"
            label={muiLabel(dictionary, locale, `status.${status.toLowerCase()}`, status)}
            color={canClaim ? "success" : "default"}
          />
        </Content>
        <Actions {...(slotProps?.actions ?? {})}>
          <ButtonSlot
            {...(slotProps?.button ?? {})}
            variant="contained"
            disabled={!canClaim || onClaim === undefined}
            onClick={() => setOpen(true)}
          >
            {muiLabel(dictionary, locale, "redemption.submit", "Redeem")}
          </ButtonSlot>
        </Actions>
      </Root>
      <DialogSlot
        {...(slotProps?.dialog ?? {})}
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby={`reward-dialog-${reward.id}`}
      >
        <DialogTitle id={`reward-dialog-${reward.id}`}>
          Redeem {localized(reward.title, locale)}?
        </DialogTitle>
        <DialogContent>Once redeemed, this reward may not be available again.</DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>
            {muiLabel(dictionary, locale, "redemption.cancel", "Cancel")}
          </Button>
          <Button variant="contained" onClick={claim}>
            {muiLabel(dictionary, locale, "redemption.confirm", "Confirm")}
          </Button>
        </DialogActions>
      </DialogSlot>
    </>
  );
}

export function MuiRewardList<TLocale extends string = SupportedLocale>({
  rewards,
  state,
  locale = "en" as TLocale,
  dictionary,
  onClaim,
  sx,
  slots,
  slotProps,
  renderRewardCard,
}: MuiRewardListProps<TLocale>): ReactNode {
  const Root = slots?.root ?? Stack;
  const Item = slots?.item ?? Box;
  return (
    <Root {...(slotProps?.root ?? {})} spacing={2} sx={sx}>
      {rewards.map((reward) => {
        const rewardState = state.rewards.find((item) => item.rewardId === reward.id);
        const props: MuiRewardCardProps<TLocale> = {
          reward,
          ...(rewardState === undefined ? {} : { state: rewardState }),
          ...(state.inventory === undefined ? {} : { inventory: state.inventory }),
          locale,
          ...(dictionary === undefined ? {} : { dictionary }),
          ...(onClaim === undefined ? {} : { onClaim }),
        };
        return (
          <Item {...(slotProps?.item ?? {})} key={reward.id}>
            {renderRewardCard?.(props) ?? <MuiRewardCard {...props} />}
          </Item>
        );
      })}
    </Root>
  );
}

export function MuiSyncStatusBanner({
  status,
  locale = "en",
  dictionary,
  sx,
  autoHideDuration = null,
  slots,
  slotProps,
}: MuiSyncStatusBannerProps): ReactNode {
  if (!status.isSyncing && status.pendingCount === 0 && status.rejectedHistory.length === 0)
    return null;
  const SnackbarSlot = slots?.snackbar ?? Snackbar;
  const AlertSlot = slots?.alert ?? Alert;
  const rollback = status.rejectedHistory.at(-1)?.reason.message;
  const syncing = status.isSyncing;
  const severity = syncing ? "info" : rollback !== undefined ? "warning" : "info";
  const message = syncing
    ? muiLabel(dictionary, locale, "sync.syncing", "Syncing your latest activity…")
    : rollback !== undefined
      ? `Some activity was rolled back. ${rollback}`
      : `${muiLabel(dictionary, locale, "sync.offline", "Recording offline")} (${status.pendingCount} ${muiLabel(dictionary, locale, "sync.unsynced", "unsynced")})`;
  return (
    <SnackbarSlot
      {...(slotProps?.snackbar ?? {})}
      open
      autoHideDuration={autoHideDuration}
      sx={sx}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <AlertSlot
        {...(slotProps?.alert ?? {})}
        severity={severity}
        role={rollback !== undefined ? "alert" : "status"}
      >
        {message}
      </AlertSlot>
    </SnackbarSlot>
  );
}

export function MuiRallyViewer<TLocale extends string = SupportedLocale>({
  config: configProp,
  adapter,
  locale = "en" as TLocale,
  dictionary,
  sx,
  showSyncStatus = true,
  slots,
  slotProps,
  renderSpotCard,
  renderRewardCard,
  onStampStamped,
}: MuiRallyViewerProps<TLocale>): ReactNode {
  const [stampedSpot, setStampedSpot] = useState<PublicSpotItem<TLocale> | null>(null);
  const [subscribedState, setSubscribedState] = useState<StampRallyState | null>(null);
  useEffect(() => {
    if (adapter?.subscribe === undefined) return;
    return adapter.subscribe(setSubscribedState);
  }, [adapter]);
  const config = configProp ?? (adapter?.config as PublicRallyConfig<TLocale> | undefined);
  if (config === undefined)
    return <Alert severity="error">A rally config or adapter is required.</Alert>;
  const state =
    adapter?.subscribe === undefined
      ? (adapter?.state ?? defaultState(config.id))
      : (subscribedState ?? adapter.state ?? defaultState(config.id));
  const progress = calculateProgress(state, config);
  const Root = slots?.root ?? Box;
  const Header = slots?.header ?? Box;
  const Progress = slots?.progress ?? LinearProgress;
  const SpotGrid = slots?.spotGrid ?? MuiSpotGrid;
  const RewardList = slots?.rewardList ?? MuiRewardList;
  const SyncBanner = slots?.syncStatusBanner ?? MuiSyncStatusBanner;
  const busy = adapter?.isLoading === true;
  const handleCheckIn = async (spotId: string, proof: unknown): Promise<unknown> => {
    if (adapter === undefined) return undefined;
    const result = await adapter.onCheckIn(spotId, proof);
    if (result.ok) {
      const spot = config.spots.find((item) => item.id === spotId);
      if (spot !== undefined) {
        setStampedSpot(spot);
        onStampStamped?.(spot as unknown as SpotItem<TLocale>);
      }
    }
    return result;
  };
  const rootProps = slotProps?.root ?? {};
  return (
    <Root {...rootProps} sx={sx} component="section" aria-label="Stamp rally">
      <Header {...(slotProps?.header ?? {})}>
        <Typography variant="h4" component="h1">
          {localized(config.title, locale)}
        </Typography>
        <Typography variant="body2">
          {progress.acquired} / {progress.total}
        </Typography>
        <Progress
          {...(slotProps?.progress ?? {})}
          variant="determinate"
          value={progress.percentage}
        />
      </Header>
      {adapter?.error !== null && adapter?.error !== undefined && (
        <Alert severity="error">{adapter.error.message}</Alert>
      )}
      {stampedSpot !== null && (
        <Alert
          severity="success"
          role="status"
          sx={{ animation: "stamprally-stamp-pop 600ms ease-out" }}
        >
          {localized(stampedSpot.name, locale)} — Verified
        </Alert>
      )}
      {showSyncStatus && adapter !== undefined && (
        <SyncBanner
          {...(slotProps?.syncStatusBanner ?? {})}
          status={adapter.syncState}
          locale={locale}
          {...(dictionary === undefined ? {} : { dictionary })}
        />
      )}
      {busy ? <LinearProgress aria-label="Loading" /> : null}
      <SpotGrid
        {...(slotProps?.spotGrid ?? {})}
        spots={config.spots}
        state={state}
        locale={locale}
        {...(dictionary === undefined ? {} : { dictionary })}
        {...(adapter === undefined ? {} : { onCheckIn: handleCheckIn })}
        {...(renderSpotCard === undefined ? {} : { renderSpotCard })}
      />
      <Typography variant="h5" component="h2" sx={{ mt: 4 }}>
        Rewards
      </Typography>
      <RewardList
        {...(slotProps?.rewardList ?? {})}
        rewards={config.rewards}
        state={state}
        locale={locale}
        {...(dictionary === undefined ? {} : { dictionary })}
        {...(adapter === undefined ? {} : { onClaim: adapter.onClaimReward })}
        {...(renderRewardCard === undefined ? {} : { renderRewardCard })}
      />
    </Root>
  );
}

export interface MuiSpotEditorProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly spot: SpotItem<TLocale, TMeta>;
  readonly availableSpotIds?: ReadonlyArray<string>;
  readonly locale?: TLocale;
  readonly onChange: (spot: SpotItem<TLocale, TMeta>) => void;
  readonly onRemove?: () => void;
  readonly sx?: MuiSx;
  readonly slots?: { readonly root?: MuiSlot; readonly removeButton?: MuiSlot };
  readonly slotProps?: MuiSlotProps;
}

function conditionFor(type: CheckInCondition["type"]): CheckInCondition {
  if (type === "qr") return { type: "qr", secretToken: "" };
  if (type === "gps") return { type: "gps", latitude: 0, longitude: 0, radiusMeters: 100 };
  if (type === "nfc") return { type: "nfc", tagId: "" };
  if (type === "custom") return { type: "custom", validatorName: "" };
  return { type: "passcode", code: "" };
}

export function MuiSpotEditor<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  spot,
  availableSpotIds = [],
  locale = "en" as TLocale,
  onChange,
  onRemove,
  sx,
  slots,
  slotProps,
}: MuiSpotEditorProps<TLocale, TMeta>): ReactNode {
  const Root = slots?.root ?? Box;
  const RemoveButton = slots?.removeButton ?? IconButton;
  const updateText = (key: "name" | "description" | "hint", value: string): void =>
    onChange({ ...spot, [key]: updateLocalizedField(spot[key] ?? "", locale, value) });
  const conditionType = spot.conditions[0]?.type ?? "passcode";
  return (
    <Root {...(slotProps?.root ?? {})} sx={sx}>
      <Stack spacing={2}>
        <TextField
          label="Title"
          value={localized(spot.name, locale)}
          onChange={(event) => updateText("name", event.target.value)}
        />
        <TextField
          label="Description"
          value={localized(spot.description, locale)}
          onChange={(event) => updateText("description", event.target.value)}
        />
        <TextField
          label="Hint"
          value={localized(spot.hint, locale)}
          onChange={(event) => updateText("hint", event.target.value)}
        />
        <FormControl fullWidth>
          <InputLabel id={`condition-${spot.id}`}>Verification method</InputLabel>
          <Select
            labelId={`condition-${spot.id}`}
            label="Verification method"
            value={conditionType}
            onChange={(event) =>
              onChange({
                ...spot,
                conditions: [conditionFor(event.target.value as CheckInCondition["type"])],
              })
            }
          >
            <MenuItem value="passcode">Passcode</MenuItem>
            <MenuItem value="qr">QR</MenuItem>
            <MenuItem value="gps">GPS</MenuItem>
            <MenuItem value="nfc">NFC</MenuItem>
            <MenuItem value="custom">Custom</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel id={`prerequisite-${spot.id}`}>Prerequisite spot</InputLabel>
          <Select
            labelId={`prerequisite-${spot.id}`}
            label="Prerequisite spot"
            value={spot.prerequisites?.[0] ?? ""}
            onChange={(event) =>
              onChange({
                ...spot,
                prerequisites: event.target.value === "" ? [] : [event.target.value],
              })
            }
          >
            <MenuItem value="">None</MenuItem>
            {availableSpotIds
              .filter((id) => id !== spot.id)
              .map((id) => (
                <MenuItem key={id} value={id}>
                  {id}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        {onRemove !== undefined && (
          <RemoveButton
            {...(slotProps?.removeButton ?? {})}
            aria-label={`Delete ${localized(spot.name, locale)}`}
            onClick={onRemove}
          >
            <DeleteOutlineIcon />
          </RemoveButton>
        )}
      </Stack>
    </Root>
  );
}

export interface MuiSpotListProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly spots: ReadonlyArray<SpotItem<TLocale, TMeta>>;
  readonly locale?: TLocale;
  readonly onAdd: () => void;
  readonly onChange: (spot: SpotItem<TLocale, TMeta>) => void;
  readonly onRemove: (spotId: string) => void;
  readonly onMove: (fromIndex: number, toIndex: number) => void;
  readonly sx?: MuiSx;
  readonly slots?: {
    readonly root?: MuiSlot;
    readonly list?: MuiSlot;
    readonly item?: MuiSlot;
    readonly addButton?: MuiSlot;
  };
  readonly slotProps?: MuiSlotProps;
}

export function MuiSpotList<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  spots,
  locale = "en" as TLocale,
  onAdd,
  onChange,
  onRemove,
  onMove,
  sx,
  slots,
  slotProps,
}: MuiSpotListProps<TLocale, TMeta>): ReactNode {
  const Root = slots?.root ?? Box;
  const ListSlot = slots?.list ?? List;
  const ItemSlot = slots?.item ?? ListItem;
  const AddButton = slots?.addButton ?? Button;
  return (
    <Root {...(slotProps?.root ?? {})} {...(sx === undefined ? {} : { sx })}>
      <AddButton
        {...(slotProps?.addButton ?? {})}
        startIcon={<RedeemIcon />}
        variant="outlined"
        onClick={onAdd}
      >
        Add spot
      </AddButton>
      <ListSlot {...(slotProps?.list ?? {})}>
        {spots.map((spot, index) => (
          <ItemSlot {...(slotProps?.item ?? {})} key={spot.id} divider sx={{ display: "block" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1">{localized(spot.name, locale)}</Typography>
              <span>
                <IconButton
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => onMove(index, index - 1)}
                >
                  <ArrowUpwardIcon />
                </IconButton>
                <IconButton
                  aria-label="Move down"
                  disabled={index === spots.length - 1}
                  onClick={() => onMove(index, index + 1)}
                >
                  <ArrowDownwardIcon />
                </IconButton>
              </span>
            </Stack>
            <MuiSpotEditor
              spot={spot}
              availableSpotIds={spots.map((item) => item.id)}
              locale={locale}
              onChange={onChange}
              onRemove={() => onRemove(spot.id)}
            />
          </ItemSlot>
        ))}
      </ListSlot>
    </Root>
  );
}

export interface MuiRewardEditorProps<TLocale extends string = SupportedLocale> {
  readonly reward: Reward<TLocale>;
  readonly locale?: TLocale;
  readonly onChange: (reward: Reward<TLocale>) => void;
  readonly onRemove?: () => void;
  readonly sx?: MuiSx;
  readonly slots?: {
    readonly root?: MuiSlot;
    readonly dialog?: MuiSlot;
    readonly button?: MuiSlot;
  };
  readonly slotProps?: MuiSlotProps;
}

export function MuiRewardEditor<TLocale extends string = SupportedLocale>({
  reward,
  locale = "en" as TLocale,
  onChange,
  onRemove,
  sx,
  slots,
  slotProps,
}: MuiRewardEditorProps<TLocale>): ReactNode {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stockEnabled, setStockEnabled] = useState(reward.stockLimit !== undefined);
  const [userLimitEnabled, setUserLimitEnabled] = useState(reward.userClaimLimit !== undefined);
  const updateOptionalNumber = (
    key: "stockLimit" | "userClaimLimit",
    value: number | undefined,
  ): void => {
    if (value === undefined) {
      if (key === "stockLimit") {
        const { stockLimit: _removed, ...next } = reward;
        onChange(next);
      } else {
        const { userClaimLimit: _removed, ...next } = reward;
        onChange(next);
      }
      return;
    }
    if (key === "stockLimit") onChange({ ...reward, stockLimit: value });
    else onChange({ ...reward, userClaimLimit: value });
  };
  const Root = slots?.root ?? Box;
  const DialogSlot = slots?.dialog ?? Dialog;
  const ButtonSlot = slots?.button ?? Button;
  const numberField = (
    key: "requiredStampCount" | "stockLimit" | "userClaimLimit",
    enabled: boolean,
  ): ReactNode => (
    <TextField
      label={
        key === "requiredStampCount"
          ? "Required stamps"
          : key === "stockLimit"
            ? "Stock limit"
            : "User claim limit"
      }
      type="number"
      disabled={key !== "requiredStampCount" && !enabled}
      value={reward[key] ?? ""}
      onChange={(event) => {
        const value = event.target.value === "" ? undefined : Number(event.target.value);
        if (key === "requiredStampCount") {
          if (value !== undefined) onChange({ ...reward, requiredStampCount: value });
        } else updateOptionalNumber(key, value);
      }}
    />
  );
  return (
    <Root {...(slotProps?.root ?? {})} {...(sx === undefined ? {} : { sx })}>
      <Stack spacing={2}>
        <TextField
          label="Title"
          value={localized(reward.title, locale)}
          onChange={(event) =>
            onChange({
              ...reward,
              title: updateLocalizedField(reward.title, locale, event.target.value),
            })
          }
        />
        <TextField
          label="Description"
          value={localized(reward.description, locale)}
          onChange={(event) =>
            onChange({
              ...reward,
              description: updateLocalizedField(
                reward.description ?? "",
                locale,
                event.target.value,
              ),
            })
          }
        />
        {numberField("requiredStampCount", true)}
        <FormControlLabel
          control={
            <Switch
              checked={stockEnabled}
              onChange={(event) => {
                setStockEnabled(event.target.checked);
                updateOptionalNumber(
                  "stockLimit",
                  event.target.checked ? (reward.stockLimit ?? 1) : undefined,
                );
              }}
            />
          }
          label="Limit inventory"
        />
        {numberField("stockLimit", stockEnabled)}
        <FormControlLabel
          control={
            <Switch
              checked={userLimitEnabled}
              onChange={(event) => {
                setUserLimitEnabled(event.target.checked);
                updateOptionalNumber(
                  "userClaimLimit",
                  event.target.checked ? (reward.userClaimLimit ?? 1) : undefined,
                );
              }}
            />
          }
          label="Limit per user"
        />
        {numberField("userClaimLimit", userLimitEnabled)}
        <ButtonSlot {...(slotProps?.button ?? {})} onClick={() => setAdvancedOpen(true)}>
          Passcode and unlock conditions
        </ButtonSlot>
        {onRemove !== undefined && (
          <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={onRemove}>
            Delete reward
          </Button>
        )}
      </Stack>
      <DialogSlot
        {...(slotProps?.dialog ?? {})}
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
      >
        <DialogTitle>Advanced reward settings</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            margin="dense"
            label="Staff passcode"
            value={reward.staffPasscode ?? ""}
            onChange={(event) => {
              if (event.target.value === "") {
                const { staffPasscode: _removed, ...next } = reward;
                onChange(next);
              } else onChange({ ...reward, staffPasscode: event.target.value });
            }}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Digital content URL"
            value={reward.digitalContentUrl ?? ""}
            onChange={(event) => {
              if (event.target.value === "") {
                const { digitalContentUrl: _removed, ...next } = reward;
                onChange(next);
              } else onChange({ ...reward, digitalContentUrl: event.target.value });
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdvancedOpen(false)}>Done</Button>
        </DialogActions>
      </DialogSlot>
    </Root>
  );
}

export interface MuiMetadataEditorProps {
  readonly publicMetadata?: Readonly<Record<string, unknown>>;
  readonly serverMetadata?: Readonly<Record<string, unknown>>;
  readonly onPublicMetadataChange: (metadata: Readonly<Record<string, unknown>>) => void;
  readonly onServerMetadataChange: (metadata: Readonly<Record<string, unknown>>) => void;
  readonly sx?: MuiSx;
  readonly slots?: { readonly root?: MuiSlot; readonly tabs?: MuiSlot; readonly table?: MuiSlot };
  readonly slotProps?: MuiSlotProps;
}

function MetadataTable({
  values,
  onChange,
  TableComponent = Table,
  tableProps = {},
}: {
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (values: Readonly<Record<string, unknown>>) => void;
  readonly TableComponent?: MuiSlot;
  readonly tableProps?: Record<string, unknown>;
}): ReactNode {
  const entries = Object.entries(values);
  const update = (oldKey: string, key: string, value: string): void => {
    const next = { ...values };
    if (oldKey !== key) delete next[oldKey];
    next[key] = value;
    onChange(next);
  };
  return (
    <TableComponent {...tableProps} size="small">
      <TableHead>
        <TableRow>
          <TableCell>Key</TableCell>
          <TableCell>Value</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map(([key, value]) => (
          <TableRow key={key}>
            <TableCell>
              <TextField
                variant="standard"
                value={key}
                onChange={(event) => update(key, event.target.value, String(value))}
              />
            </TableCell>
            <TableCell>
              <TextField
                variant="standard"
                value={String(value)}
                onChange={(event) => update(key, key, event.target.value)}
              />
            </TableCell>
            <TableCell>
              <IconButton
                aria-label={`Delete ${key}`}
                onClick={() => {
                  const next = { ...values };
                  delete next[key];
                  onChange(next);
                }}
              >
                <DeleteOutlineIcon />
              </IconButton>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableComponent>
  );
}

export function MuiMetadataEditor({
  publicMetadata = {},
  serverMetadata = {},
  onPublicMetadataChange,
  onServerMetadataChange,
  sx,
  slots,
  slotProps,
}: MuiMetadataEditorProps): ReactNode {
  const [tab, setTab] = useState(0);
  const values = tab === 0 ? publicMetadata : serverMetadata;
  const onChange = tab === 0 ? onPublicMetadataChange : onServerMetadataChange;
  const Root = slots?.root ?? Box;
  const TabsSlot = slots?.tabs ?? Tabs;
  const TableSlot = slots?.table ?? Table;
  return (
    <Root {...(slotProps?.root ?? {})} {...(sx === undefined ? {} : { sx })}>
      <TabsSlot
        {...(slotProps?.tabs ?? {})}
        value={tab}
        onChange={(_event: SyntheticEvent, value: number) => setTab(value)}
        aria-label="Metadata type"
      >
        <Tab label="publicMetadata" />
        <Tab label="serverMetadata" />
      </TabsSlot>
      <MetadataTable
        values={values}
        onChange={onChange}
        TableComponent={TableSlot}
        {...(slotProps?.table === undefined ? {} : { tableProps: slotProps.table })}
      />
      <Button onClick={() => onChange({ ...values, [`key${Object.keys(values).length + 1}`]: "" })}>
        Add metadata
      </Button>
    </Root>
  );
}

export interface MuiAdminRallyEditorProps<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly config: AdminRallyConfig<TLocale, TMeta>;
  readonly onChange: (config: AdminRallyConfig<TLocale, TMeta>) => void;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly locales?: ReadonlyArray<TLocale>;
  readonly showLocalizationPreview?: boolean;
  readonly sx?: MuiSx;
  readonly slots?: {
    readonly root?: MuiSlot;
    readonly tabs?: MuiSlot;
    readonly tabPanel?: MuiSlot;
  };
  readonly slotProps?: MuiSlotProps;
}

function editorLabel<TLocale extends string>(
  dictionary: LocaleDictionary<TLocale> | undefined,
  locale: TLocale,
  key: string,
  fallback: string,
): string {
  return dictionary?.[locale]?.[key] ?? fallback;
}

export function MuiAdminRallyEditor<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  config: initialConfig,
  onChange,
  locale = "en" as TLocale,
  dictionary,
  locales,
  showLocalizationPreview = true,
  sx,
  slots,
  slotProps,
}: MuiAdminRallyEditorProps<TLocale, TMeta>): ReactNode {
  const editor = useAdminRallyEditor(initialConfig, { onChange });
  const [tab, setTab] = useState(0);
  const Root = slots?.root ?? Box;
  const TabsSlot = slots?.tabs ?? Tabs;
  const Panel = slots?.tabPanel ?? Box;
  const { config } = editor;
  const previewLocales =
    locales ??
    ([locale, "ja", "en"] as TLocale[]).filter(
      (item, index, values) => values.indexOf(item) === index,
    );
  const updateMetadata = (
    key: "publicMetadata" | "serverMetadata",
    value: Readonly<Record<string, unknown>>,
  ): void => editor.update({ [key]: value } as Partial<AdminRallyConfig<TLocale, TMeta>>);
  return (
    <Root
      {...(slotProps?.root ?? {})}
      sx={sx}
      component="section"
      aria-label={editorLabel(dictionary, locale, "rallyEditor", "Rally editor")}
    >
      <Typography variant="h4" component="h1">
        {localized(config.title, locale)}
      </Typography>
      <TabsSlot
        {...(slotProps?.tabs ?? {})}
        value={tab}
        onChange={(_event: SyntheticEvent, value: number) => setTab(value)}
        aria-label="Rally editor sections"
      >
        <Tab label="Basic settings" />
        <Tab label="Spots" />
        <Tab label="Rewards" />
        <Tab label="Metadata" />
        <Tab label="Theme" />
        {showLocalizationPreview && <Tab label="Translations" />}
      </TabsSlot>
      <Panel {...(slotProps?.tabPanel ?? {})} role="tabpanel" sx={{ pt: 3 }}>
        {tab === 0 && (
          <Stack spacing={2}>
            <TextField
              label="Title"
              value={localized(config.title, locale)}
              onChange={(event) =>
                editor.update({
                  title: updateLocalizedField(config.title, locale, event.target.value),
                })
              }
            />
            <TextField
              label="Description"
              value={localized(config.description, locale)}
              onChange={(event) =>
                editor.update({
                  description: updateLocalizedField(
                    config.description ?? "",
                    locale,
                    event.target.value,
                  ),
                })
              }
            />
            <TextField
              label="Server endpoint"
              value={config.serverEndpoint ?? ""}
              onChange={(event) => editor.update({ serverEndpoint: event.target.value })}
            />
          </Stack>
        )}
        {tab === 1 && (
          <MuiSpotList
            spots={config.spots}
            locale={locale}
            onAdd={() => editor.addSpot()}
            onChange={(spot) => editor.updateSpot(spot.id, spot)}
            onRemove={editor.removeSpot}
            onMove={editor.reorderSpots}
          />
        )}
        {tab === 2 && (
          <Stack spacing={2}>
            {config.rewards.map((reward, index) => (
              <Accordion key={reward.id} defaultExpanded={index === 0}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  {localized(reward.title, locale)}
                </AccordionSummary>
                <AccordionDetails>
                  <MuiRewardEditor
                    reward={reward}
                    locale={locale}
                    onChange={(next) => editor.updateReward(reward.id, next)}
                    onRemove={() => editor.removeReward(reward.id)}
                  />
                </AccordionDetails>
              </Accordion>
            ))}
            <Button variant="outlined" onClick={() => editor.addReward()}>
              Add reward
            </Button>
          </Stack>
        )}
        {tab === 3 && (
          <MuiMetadataEditor
            {...(config.publicMetadata === undefined && config.metadata === undefined
              ? {}
              : { publicMetadata: config.publicMetadata ?? config.metadata })}
            {...(config.serverMetadata === undefined
              ? {}
              : { serverMetadata: config.serverMetadata })}
            onPublicMetadataChange={(value) => updateMetadata("publicMetadata", value)}
            onServerMetadataChange={(value) => updateMetadata("serverMetadata", value)}
          />
        )}
        {tab === 4 && (
          <ThemeEditor
            theme={config.theme ?? DEFAULT_SHEET_THEME}
            onChange={(theme) => editor.update({ theme })}
          />
        )}
        {showLocalizationPreview && tab === 5 && (
          <MuiLocalizationSplitPreview
            config={config}
            locales={previewLocales}
            {...(dictionary === undefined ? {} : { dictionary })}
            onChange={(next) => editor.setConfig(next)}
          />
        )}
      </Panel>
    </Root>
  );
}

export interface ThemeEditorProps {
  readonly theme: SheetTheme;
  readonly onChange: (theme: SheetTheme) => void;
  readonly slots?: { readonly root?: MuiSlot; readonly field?: MuiSlot; readonly switch?: MuiSlot };
  readonly slotProps?: MuiSlotProps;
}

export function ThemeEditor({ theme, onChange, slots, slotProps }: ThemeEditorProps): ReactNode {
  const updateBackground = (value: string): void => {
    if (value === "") {
      const { backgroundColor: _removed, ...next } = theme;
      onChange(next);
      return;
    }
    onChange({ ...theme, backgroundColor: value });
  };
  const Root = slots?.root ?? Stack;
  const Field = slots?.field ?? TextField;
  const SwitchSlot = slots?.switch ?? Switch;
  return (
    <Root {...(slotProps?.root ?? {})} spacing={2}>
      <Field
        {...(slotProps?.field ?? {})}
        label="Primary color"
        value={theme.primaryColor}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange({ ...theme, primaryColor: event.target.value })
        }
      />
      <Field
        {...(slotProps?.field ?? {})}
        label="Background color"
        value={theme.backgroundColor ?? ""}
        onChange={(event: ChangeEvent<HTMLInputElement>) => updateBackground(event.target.value)}
      />
      <FormControlLabel
        control={
          <SwitchSlot
            {...(slotProps?.switch ?? {})}
            checked={theme.slotShape === "circle"}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...theme, slotShape: event.target.checked ? "circle" : "rounded" })
            }
          />
        }
        label="Circular slots"
      />
    </Root>
  );
}

export type { UseAdminRallyEditorReturn, UseStampRallyReturn, UseStampRallySyncState };
