import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import type { ClaimOptions, ClaimResult, LocaleDictionary } from "@stamprally/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { type BuiltInMuiLocale, DEFAULT_MUI_DICTIONARY } from "./locales.js";

export interface MuiStaffRedemptionViewProps<TLocale extends string = BuiltInMuiLocale> {
  readonly onRedeem?: (ticketNumber: string, staffPasscode: string) => Promise<unknown>;
  readonly onClaimReward?: (rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>;
  readonly rewardId?: string;
  readonly staffId?: string;
  readonly staffPasscode?: string;
  readonly onScanQr?: () => string | null | Promise<string | null>;
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
function getError(value: unknown): { code?: string; message?: string } | undefined {
  if (typeof value !== "object" || value === null || !("error" in value)) return undefined;
  const error = (value as { readonly error?: unknown }).error;
  if (typeof error !== "object" || error === null) return undefined;
  const item = error as { readonly code?: unknown; readonly message?: unknown };
  return {
    ...(typeof item.code === "string" ? { code: item.code } : {}),
    ...(typeof item.message === "string" ? { message: item.message } : {}),
  };
}

export function MuiStaffRedemptionView<TLocale extends string = BuiltInMuiLocale>({
  onRedeem,
  onClaimReward,
  rewardId,
  staffId,
  staffPasscode: initialStaffPasscode = "",
  onScanQr,
  locale = "en" as TLocale,
  dictionary,
}: MuiStaffRedemptionViewProps<TLocale>): ReactNode {
  const [ticketNumber, setTicketNumber] = useState("");
  const [staffPasscode, setStaffPasscode] = useState(initialStaffPasscode);
  const [state, setState] = useState<"idle" | "busy" | "success" | "already" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const label = (key: string, fallback: string): string => text(dictionary, locale, key, fallback);
  const redeem = async (): Promise<void> => {
    if (ticketNumber.trim() === "" || staffPasscode === "") return;
    setState("busy");
    try {
      const result =
        onRedeem !== undefined
          ? await onRedeem(ticketNumber.trim(), staffPasscode)
          : rewardId !== undefined && onClaimReward !== undefined
            ? await onClaimReward(rewardId, {
                staffPasscode,
                ...(staffId === undefined ? {} : { staffId }),
              })
            : undefined;
      const error = getError(result);
      const failed =
        error !== undefined ||
        (typeof result === "object" && result !== null && "ok" in result && result.ok === false);
      if (failed) {
        const already = error?.code === "ALREADY_CONSUMED" || error?.code === "ALREADY_REDEEMED";
        setState(already ? "already" : "error");
        setMessage(
          error?.message ??
            label(
              already ? "redemption.alreadyRedeemed" : "redemption.invalid",
              "Could not redeem this ticket.",
            ),
        );
      } else if (result === undefined) {
        setState("error");
        setMessage(label("redemption.invalid", "Could not redeem this ticket."));
      } else {
        setState("success");
        setMessage(label("redemption.success", "Exchange completed"));
      }
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : label("redemption.invalid", "Could not redeem this ticket."),
      );
    }
  };
  const scan = (): void => {
    if (onScanQr !== undefined)
      void Promise.resolve(onScanQr()).then(
        (value) => value !== null && value !== undefined && setTicketNumber(value),
      );
  };
  return (
    <Paper
      component="section"
      sx={{ p: 2 }}
      aria-label={label("redemption.title", "Staff redemption")}
    >
      <Stack spacing={2}>
        <Typography variant="h5" component="h2">
          {label("redemption.title", "Staff redemption")}
        </Typography>
        <TextField
          label={label("redemption.ticket", "Ticket number or QR value")}
          value={ticketNumber}
          onChange={(event) => setTicketNumber(event.target.value)}
          autoComplete="off"
        />
        {onScanQr !== undefined && (
          <Button variant="outlined" onClick={scan}>
            {label("redemption.scan", "Scan QR")}
          </Button>
        )}
        <TextField
          type="password"
          label={label("redemption.staffPasscode", "Staff passcode")}
          value={staffPasscode}
          onChange={(event) => setStaffPasscode(event.target.value)}
          autoComplete="off"
        />
        <Button
          variant="contained"
          size="large"
          disabled={state === "busy" || ticketNumber.trim() === "" || staffPasscode === ""}
          onClick={() => void redeem()}
        >
          {state === "busy"
            ? label("verifying", "Verifying…")
            : label("redemption.submit", "Redeem ticket")}
        </Button>
        {message !== null && (
          <Alert
            severity={state === "success" ? "success" : state === "already" ? "warning" : "error"}
            role={state === "success" ? "status" : "alert"}
          >
            {state === "already"
              ? label("redemption.alreadyRedeemed", "Already exchanged")
              : message}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

export const StaffRedemptionView = MuiStaffRedemptionView;
