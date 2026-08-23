import {
  type RallyConfig,
  resolveLocalizedText,
  type StampCondition,
  type SupportedLocale,
} from "@stamprally/core";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { getMessages } from "../../locales/index.js";

interface QrExportModalProps {
  readonly open: boolean;
  readonly config: RallyConfig;
  readonly locale: SupportedLocale;
  readonly onClose: () => void;
}

interface PrintableQrProps {
  readonly value: string;
  readonly label: string;
  readonly loadingLabel: string;
  readonly errorLabel: string;
}

function findToken(condition: StampCondition): string | null {
  switch (condition.type) {
    case "token":
      return condition.token;
    case "time_window":
      return findToken(condition.condition);
    case "composite":
      for (const child of condition.conditions) {
        const token = findToken(child);
        if (token !== null) return token;
      }
      return null;
    case "instant":
    case "geo":
      return null;
  }
}

function qrPayload(rallyId: string, stampId: string, token: string | null): string {
  if (token !== null) return token;
  return JSON.stringify({ version: 1, rallyId, stampId });
}

function PrintableQr({ value, label, loadingLabel, errorLabel }: PrintableQrProps) {
  const [source, setSource] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setSource(undefined);
    void QRCode.toString(value, {
      type: "svg",
      width: 256,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#17202a", light: "#ffffff" },
    }).then(
      (svg) => {
        if (active) setSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      },
      () => {
        if (active) setSource(null);
      },
    );
    return () => {
      active = false;
    };
  }, [value]);

  if (source === null) {
    return (
      <div className="qr-pop-card__loading" role="alert">
        {errorLabel}
      </div>
    );
  }

  return source === undefined ? (
    <div className="qr-pop-card__loading" role="status">
      {loadingLabel}
    </div>
  ) : (
    <img className="qr-pop-card__qr" src={source} alt={label} />
  );
}

export function QrExportModal({ open, config, locale, onClose }: QrExportModalProps) {
  const messages = getMessages(locale);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="qr-export-modal"
      aria-labelledby="qr-export-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="qr-export-modal__toolbar">
        <div>
          <p className="eyebrow">PRINT KIT</p>
          <h2 id="qr-export-title">{messages.printPopTitle}</h2>
          <p>{messages.printPopDescription}</p>
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={() => window.print()}>
            {messages.printAll}
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            {messages.close}
          </button>
        </div>
      </div>

      <div className="qr-pop-grid">
        {config.stamps.map((stamp, index) => {
          const name = resolveLocalizedText(stamp.name, locale);
          const token = findToken(stamp.condition);
          const payload = qrPayload(config.id, stamp.id, token);
          return (
            <article className="qr-pop-card" key={stamp.id}>
              <header>
                <span>#{String(index + 1).padStart(2, "0")}</span>
                <strong>{resolveLocalizedText(config.title, locale) || config.id}</strong>
              </header>
              <h3>{name}</h3>
              <PrintableQr
                value={payload}
                label={messages.qrForSpot(name)}
                loadingLabel={messages.generatingQr}
                errorLabel={messages.qrGenerationFailed}
              />
              <div className="qr-pop-card__passcode">
                <span>{messages.checkInPasscode}</span>
                <strong>{token ?? messages.noPasscode}</strong>
              </div>
              <small>{messages.scanToCheckIn}</small>
            </article>
          );
        })}
      </div>
    </dialog>
  );
}
