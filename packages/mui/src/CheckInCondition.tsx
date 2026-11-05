import { Alert, Button, Stack, TextField } from "@mui/material";
import type { LocaleDictionary, PublicCheckInCondition } from "@stamprally/core";
import {
  getCurrentGeoContext,
  isNfcSupported,
  isQrSupported,
  readNfcContext,
  readQrContext,
} from "@stamprally/core";
import { type ReactElement, useRef, useState } from "react";
import { resolveMuiLabel } from "./locales.js";

interface CheckInConditionProps<TLocale extends string> {
  condition: PublicCheckInCondition;
  disabled: boolean;
  locale: TLocale;
  dictionary?: LocaleDictionary<TLocale>;
  onSubmit: (proof: unknown) => unknown;
}

export function CheckInCondition<TLocale extends string>(
  props: CheckInConditionProps<TLocale>,
): ReactElement {
  const { condition, disabled, locale, dictionary, onSubmit } = props;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const label = (key: string, fallback: string): string =>
    resolveMuiLabel(dictionary, locale, key, fallback);
  const verify = async (getProof: () => Promise<unknown>): Promise<void> => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const proof = await getProof();
      const result = await onSubmit(proof);
      if (typeof result === "object" && result !== null && "ok" in result && result.ok === false) {
        const errorCode =
          "error" in result &&
          typeof result.error === "object" &&
          result.error !== null &&
          "code" in result.error
            ? result.error.code
            : undefined;
        if (errorCode === "RALLY_UNAVAILABLE" || errorCode === "SPOT_UNAVAILABLE")
          setError(
            label(
              "availability.checkInClosed",
              "Check-in is closed. Check the opening hours and try again.",
            ),
          );
        else
          setError(
            label(
              "verificationFailed",
              "Verification failed. Please check the details and try again.",
            ),
          );
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : label("verificationFailed", "Verification failed. Please try again."),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const readSensor = async (): Promise<unknown> => {
    if (condition.type === "gps") {
      const result = await getCurrentGeoContext();
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    }
    if (condition.type === "nfc") {
      const result = await readNfcContext();
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    }
    if (video.current === null)
      throw new Error(label("qrUnavailable", "QR scanning is unavailable."));
    const result = await readQrContext(video.current);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      {busy && <span role="status">{label("verifying", "Verifying…")}</span>}
      {condition.type === "qr" && (
        <>
          <video ref={video} aria-label={label("qrCamera", "QR camera")} hidden={!isQrSupported()}>
            <track kind="captions" />
          </video>
          <Button
            disabled={disabled || busy || !isQrSupported()}
            onClick={() => void verify(readSensor)}
          >
            {label("scanQr", "Scan QR")}
          </Button>
          {!isQrSupported() && (
            <Alert severity="info">
              {label("qrUnavailable", "QR scanning is unavailable. Enter the code manually.")}
            </Alert>
          )}
        </>
      )}
      {(condition.type === "passcode" ||
        condition.type === "custom" ||
        condition.type === "qr") && (
        <Stack
          component="form"
          spacing={1}
          onSubmit={(event) => {
            event.preventDefault();
            void verify(async () => value);
          }}
        >
          <TextField
            label={
              condition.type === "passcode"
                ? label("passcode", "Passcode")
                : condition.type === "qr"
                  ? label("qrValue", "QR value")
                  : label("proof", "Proof")
            }
            value={value}
            disabled={disabled || busy}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={disabled || busy || value.trim() === ""}
          >
            {label("checkIn", "Check in")}
          </Button>
        </Stack>
      )}
      {(condition.type === "gps" || condition.type === "nfc") && (
        <Button
          variant="contained"
          disabled={disabled || busy || (condition.type === "nfc" && !isNfcSupported())}
          onClick={() => void verify(readSensor)}
        >
          {condition.type === "gps"
            ? label("checkLocation", "Check location")
            : label("readNfc", "Read NFC")}
        </Button>
      )}
      {condition.type === "nfc" && !isNfcSupported() && (
        <Alert severity="info">
          {label(
            "nfcUnavailable",
            "NFC is unavailable. Ask the organizer for another check-in method.",
          )}
        </Alert>
      )}
      {error !== null && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
    </Stack>
  );
}
