import type { LocalizedString, LocalizedText, SupportedLocale } from "./models.js";

function localeCandidates(locale: string): ReadonlyArray<string> {
  const normalized = locale.trim().replaceAll("_", "-").toLowerCase();
  if (normalized === "" || normalized === "*") return [];
  const parts = normalized.split("-");
  const candidates: string[] = [];
  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join("-");
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }
  return candidates;
}

/** Resolves the best supported locale without mutating either input collection. */
export function resolvePreferredLocale(
  supportedLocales: readonly string[],
  fallback: string,
  userLanguages?: readonly string[],
): string {
  const supported = supportedLocales.map((locale) => ({
    original: locale,
    normalized: locale.trim().replaceAll("_", "-").toLowerCase(),
  }));
  const findSupported = (candidates: ReadonlyArray<string>): string | undefined => {
    for (const candidate of candidates) {
      const match = supported.find((locale) => locale.normalized === candidate);
      if (match !== undefined) return match.original;
    }
    return undefined;
  };
  const languages =
    userLanguages ??
    (typeof navigator !== "undefined" && Array.isArray(navigator.languages)
      ? navigator.languages
      : []);
  for (const language of languages) {
    const match = findSupported(localeCandidates(language));
    if (match !== undefined) return match;
  }
  return findSupported(localeCandidates(fallback)) ?? fallback;
}

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
