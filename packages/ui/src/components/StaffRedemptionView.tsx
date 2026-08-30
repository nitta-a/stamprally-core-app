import type { ClaimOptions, ClaimResult, LocaleDictionary } from "@stamprally/core";
import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";
import { type BuiltInUiLocale, DEFAULT_UI_DICTIONARY } from "../locales/index.js";

export interface StaffRedemptionViewProps<TLocale extends string = BuiltInUiLocale> {
  readonly onRedeem?: (ticketNumber: string, staffPasscode: string) => Promise<unknown>;
  readonly onClaimReward?: (rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>;
  readonly rewardId?: string;
  readonly staffId?: string;
  readonly staffPasscode?: string;
  readonly onScanQr?: () => string | null | Promise<string | null>;
  readonly locale?: TLocale;
  readonly dictionary?: LocaleDictionary<TLocale>;
  readonly className?: string;
  readonly style?: CSSProperties;
}

type RedemptionStatus = "idle" | "redeeming" | "redeemed" | "already_redeemed" | "error";

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

function resultError(value: unknown): { code?: string; message?: string } | undefined {
  if (typeof value !== "object" || value === null || !("error" in value)) return undefined;
  const error = (value as { readonly error?: unknown }).error;
  if (typeof error !== "object" || error === null) return undefined;
  const item = error as { readonly code?: unknown; readonly message?: unknown };
  return {
    ...(typeof item.code === "string" ? { code: item.code } : {}),
    ...(typeof item.message === "string" ? { message: item.message } : {}),
  };
}

/** Compact, staff-only ticket redemption flow with an explicit double-redemption state. */
export function StaffRedemptionView<TLocale extends string = BuiltInUiLocale>({
  onRedeem,
  onClaimReward,
  rewardId,
  staffId,
  staffPasscode: initialStaffPasscode = "",
  onScanQr,
  locale = "en" as TLocale,
  dictionary,
  className,
  style,
}: StaffRedemptionViewProps<TLocale>): ReactElement {
  const [ticketNumber, setTicketNumber] = useState("");
  const [staffPasscode, setStaffPasscode] = useState(initialStaffPasscode);
  const [status, setStatus] = useState<RedemptionStatus>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const label = (key: string, fallback: string): string => text(dictionary, locale, key, fallback);
  const redeem = async (): Promise<void> => {
    if (ticketNumber.trim() === "" || staffPasscode === "") return;
    setStatus("redeeming");
    setDetail(null);
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
      const error = resultError(result);
      const failed =
        error !== undefined ||
        (typeof result === "object" && result !== null && "ok" in result && result.ok === false);
      if (failed) {
        const already = error?.code === "ALREADY_CONSUMED" || error?.code === "ALREADY_REDEEMED";
        setStatus(already ? "already_redeemed" : "error");
        setDetail(
          error?.message ??
            label(
              already ? "redemption.alreadyRedeemed" : "redemption.invalid",
              "Could not redeem this ticket.",
            ),
        );
        return;
      }
      if (result === undefined) {
        setStatus("error");
        setDetail(label("redemption.invalid", "Could not redeem this ticket."));
        return;
      }
      setStatus("redeemed");
      setDetail(label("redemption.success", "Exchange completed"));
    } catch (error) {
      setStatus("error");
      setDetail(
        error instanceof Error
          ? error.message
          : label("redemption.invalid", "Could not redeem this ticket."),
      );
    }
  };
  const scan = (): void => {
    if (onScanQr === undefined) return;
    void Promise.resolve(onScanQr()).then((value) => {
      if (value !== null && value !== undefined) setTicketNumber(value);
    });
  };
  return (
    <section
      className={className}
      style={style}
      aria-label={label("redemption.title", "Staff redemption")}
    >
      <h2>{label("redemption.title", "Staff redemption")}</h2>
      <label>
        {label("redemption.ticket", "Ticket number or QR value")}
        <input
          value={ticketNumber}
          onChange={(event) => setTicketNumber(event.target.value)}
          autoComplete="off"
        />
      </label>
      {onScanQr !== undefined && (
        <button type="button" onClick={scan}>
          {label("redemption.scan", "Scan QR")}
        </button>
      )}
      <label>
        {label("redemption.staffPasscode", "Staff passcode")}
        <input
          type="password"
          value={staffPasscode}
          onChange={(event) => setStaffPasscode(event.target.value)}
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        disabled={status === "redeeming" || ticketNumber.trim() === "" || staffPasscode === ""}
        onClick={() => void redeem()}
      >
        {status === "redeeming"
          ? label("verifying", "Verifying…")
          : label("redemption.submit", "Redeem ticket")}
      </button>
      {detail !== null && (
        <div
          role={status === "error" || status === "already_redeemed" ? "alert" : "status"}
          aria-live="assertive"
        >
          <strong>
            {label(
              status === "already_redeemed"
                ? "redemption.alreadyRedeemed"
                : status === "redeemed"
                  ? "redemption.success"
                  : "redemption.invalid",
              "Could not redeem this ticket.",
            )}
          </strong>
          {detail !==
            label(
              status === "already_redeemed"
                ? "redemption.alreadyRedeemed"
                : status === "redeemed"
                  ? "redemption.success"
                  : "redemption.invalid",
              "Could not redeem this ticket.",
            ) && <span> {detail}</span>}
        </div>
      )}
    </section>
  );
}
