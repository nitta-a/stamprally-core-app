import type { LocalizedString, LocalizedText, SupportedLocale } from "./models.js";

export function resolveLocalizedText(
  text: LocalizedText | undefined,
  locale: SupportedLocale,
  fallbackLocale: SupportedLocale = "ja",
): string {
  if (text === undefined || text === "") return "";
  if (typeof text === "string") return text;
  return text[locale] || text[fallbackLocale] || "";
}

export function toLocalizedString(text: LocalizedText | undefined): LocalizedString {
  if (text === undefined) return { ja: "", en: "" };
  return typeof text === "string" ? { ja: text, en: "" } : { ...text };
}
