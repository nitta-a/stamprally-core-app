import type { LocalizedString, LocalizedText, SupportedLocale } from "./models.js";

export function updateLocalizedField<TLocale extends string>(
  current: LocalizedText<TLocale> | undefined,
  locale: TLocale,
  newValue: string,
): LocalizedText<TLocale> {
  if (typeof current === "string" || current === undefined)
    return { [locale]: newValue } as LocalizedText<TLocale>;
  return { ...current, [locale]: newValue };
}

export function resolveLocalizedText<TLocale extends string = SupportedLocale>(
  text: LocalizedText<TLocale> | undefined,
  locale: string,
  fallbackLocale?: string,
): string {
  if (text === undefined || text === "") return "";
  if (typeof text === "string") return text;
  const fallback =
    fallbackLocale === undefined
      ? Object.values(text).find((value): value is string => typeof value === "string")
      : text[fallbackLocale as TLocale];
  return text[locale as TLocale] || fallback || "";
}

export function toLocalizedString(text: LocalizedText | undefined): LocalizedString;
export function toLocalizedString<TLocale extends string>(
  text: LocalizedText<TLocale> | undefined,
): LocalizedString<TLocale>;
export function toLocalizedString<TLocale extends string>(
  text: LocalizedText<TLocale> | undefined,
): LocalizedString<TLocale> {
  if (text === undefined) return { ja: "", en: "" } as LocalizedString<TLocale>;
  return typeof text === "string"
    ? ({ ja: text, en: "" } as LocalizedString<TLocale>)
    : ({
        ja: text["ja" as TLocale] ?? "",
        en: text["en" as TLocale] ?? "",
        ...text,
      } as LocalizedString<TLocale>);
}
