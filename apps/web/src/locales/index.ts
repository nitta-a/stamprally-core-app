import type { SupportedLocale } from "@stamprally/core";
import { enMessages } from "./en.js";
import { jaMessages } from "./ja.js";

export type Messages = typeof jaMessages;

export function getMessages(locale: SupportedLocale): Messages {
  return locale === "en" ? enMessages : jaMessages;
}

export function detectInitialLocale(): SupportedLocale {
  try {
    const stored = globalThis.localStorage?.getItem("stamprally:locale");
    if (stored === "ja" || stored === "en") return stored;
  } catch {
    // Browser storage can be unavailable; navigator fallback remains safe.
  }
  try {
    return globalThis.navigator?.language.toLowerCase().startsWith("en") ? "en" : "ja";
  } catch {
    return "ja";
  }
}

export function persistLocale(locale: SupportedLocale): void {
  try {
    globalThis.localStorage?.setItem("stamprally:locale", locale);
  } catch {
    // Language selection still works for the current render.
  }
}
