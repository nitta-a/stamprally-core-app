export type DemoLocale = "en" | "ja";

export function text(locale: DemoLocale, ja: string, en: string): string {
  return locale === "ja" ? ja : en;
}
