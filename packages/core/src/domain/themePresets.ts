import type { ThemePreset } from "./models.js";

export const THEME_PRESETS: ReadonlyArray<ThemePreset> = [
  {
    id: "default",
    name: { ja: "クラシックブルー", en: "Classic Blue" },
    description: {
      ja: "青を基調にした、明るく親しみやすい定番デザインです。",
      en: "A bright, approachable classic built around a crisp blue palette.",
    },
    theme: {
      primaryColor: "#2563eb",
      backgroundColor: "#eff6ff",
      cardBackgroundColor: "#ffffff",
      textColor: "#1e293b",
      slotShape: "circle",
      gridColumns: 3,
      unclaimedOpacity: 1,
      completedStampColor: "#dc2626",
      fontFamily: "serif",
    },
  },
  {
    id: "modern_dark",
    name: { ja: "モダンダーク", en: "Modern Dark" },
    description: {
      ja: "深いネイビーとエメラルドでまとめた、洗練されたダークテーマです。",
      en: "A polished dark theme pairing deep navy with emerald accents.",
    },
    theme: {
      primaryColor: "#10b981",
      backgroundColor: "#0f172a",
      cardBackgroundColor: "#1e293b",
      textColor: "#f8fafc",
      slotShape: "rounded",
      gridColumns: 3,
      unclaimedOpacity: 1,
      completedStampColor: "#34d399",
      fontFamily: "system-ui",
    },
  },
  {
    id: "pop_candy",
    name: { ja: "ポップキャンディ", en: "Pop Candy" },
    description: {
      ja: "ピンクを主役にした、楽しく華やかなキャンディカラーテーマです。",
      en: "A playful candy-colored theme with vivid pink at center stage.",
    },
    theme: {
      primaryColor: "#ec4899",
      backgroundColor: "#fdf2f8",
      cardBackgroundColor: "#ffffff",
      textColor: "#831843",
      slotShape: "circle",
      gridColumns: 2,
      unclaimedOpacity: 1,
      completedStampColor: "#f43f5e",
      fontFamily: "rounded-sans",
    },
  },
  {
    id: "retro_craft",
    name: { ja: "レトロクラフト", en: "Retro Craft" },
    description: {
      ja: "クラフト紙と赤茶色のインクを思わせる、温かみのあるレトロテーマです。",
      en: "A warm retro theme inspired by craft paper and earthy red ink.",
    },
    theme: {
      primaryColor: "#9a3412",
      backgroundColor: "#fef3c7",
      cardBackgroundColor: "#fffbeb",
      textColor: "#78350f",
      slotShape: "square",
      gridColumns: 3,
      unclaimedOpacity: 1,
      completedStampColor: "#b91c1c",
      fontFamily: "handwritten",
    },
  },
  {
    id: "cyber",
    name: { ja: "サイバーネオン", en: "Cyber Neon" },
    description: {
      ja: "シアンと紫のネオンが映える、シャープな近未来テーマです。",
      en: "A sharp futuristic theme illuminated by cyan and violet neon.",
    },
    theme: {
      primaryColor: "#06b6d4",
      backgroundColor: "#09090b",
      cardBackgroundColor: "#18181b",
      textColor: "#fafafa",
      slotShape: "square",
      gridColumns: 4,
      unclaimedOpacity: 1,
      completedStampColor: "#a855f7",
      fontFamily: "monospace",
    },
  },
];
