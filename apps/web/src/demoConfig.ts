import type { RallyConfig } from "@stamprally/core";
import type { StampPresentation } from "./components/StampSlot.js";

export const DEFAULT_RALLY_CONFIG: RallyConfig = {
  id: "stamp-sheet-demo-v1",
  title: { ja: "東京発見スタンプラリー", en: "TOKYO DISCOVERY STAMP RALLY" },
  description: {
    ja: "6つのチェックポイントを巡り、東京の景色を集めよう。",
    en: "Visit six checkpoints and collect scenes from Tokyo.",
  },
  isSequential: true,
  stamps: [
    {
      id: "spot-a",
      name: { ja: "ウェルカムゲート", en: "Welcome Gate" },
      description: { ja: "旅の始まりを記録します。", en: "Mark the start of your journey." },
      hint: { ja: "ボタンを押すだけで取得できます。", en: "Simply press the stamp button." },
      order: 1,
      condition: { type: "instant" },
    },
    {
      id: "spot-b",
      name: { ja: "駅のQR", en: "Station QR" },
      description: {
        ja: "駅に掲示されたコードを確認します。",
        en: "Verify the code displayed at the station.",
      },
      hint: { ja: "デモ用トークンは STAMP-B-2026 です。", en: "The demo token is STAMP-B-2026." },
      order: 2,
      condition: { type: "token", token: "STAMP-B-2026" },
    },
    {
      id: "spot-c",
      name: { ja: "東京駅", en: "Tokyo Station" },
      description: {
        ja: "丸の内駅舎付近で位置を確認します。",
        en: "Verify your location near the Marunouchi building.",
      },
      order: 3,
      condition: { type: "geo", latitude: 35.681236, longitude: 139.767125, radiusMeters: 150 },
    },
    {
      id: "spot-d",
      name: { ja: "ミュージアム受付", en: "Museum Check-in" },
      description: {
        ja: "展示を見た記念のスタンプです。",
        en: "A stamp to remember your museum visit.",
      },
      order: 4,
      condition: { type: "instant" },
    },
    {
      id: "spot-e",
      name: { ja: "NFCキオスク", en: "NFC Kiosk" },
      description: {
        ja: "NFCまたは手入力でコードを確認します。",
        en: "Verify a code by NFC or manual input.",
      },
      order: 5,
      condition: { type: "token", token: "STAMP-E-2026" },
    },
    {
      id: "spot-f",
      name: { ja: "東京タワー", en: "Tokyo Tower" },
      description: {
        ja: "東京タワー周辺で位置を確認します。",
        en: "Verify your location near Tokyo Tower.",
      },
      order: 6,
      condition: { type: "geo", latitude: 35.658581, longitude: 139.745433, radiusMeters: 180 },
    },
  ],
  rewards: [
    {
      id: "reward-sticker",
      title: { ja: "探検ステッカー", en: "Explorer Sticker" },
      description: {
        ja: "2個達成でもらえる記念ステッカー。",
        en: "A souvenir sticker unlocked after two stamps.",
      },
      type: "in_person",
      redemptionMethod: "manual_slide",
      requiredStampCount: 2,
    },
    {
      id: "reward-gift",
      title: { ja: "駅員さんからの記念品", en: "Station Staff Gift" },
      description: {
        ja: "スタッフ確認後に受け取れる特典。",
        en: "A gift redeemed after staff verification.",
      },
      type: "in_person",
      redemptionMethod: "staff_passcode",
      requiredStampCount: 4,
      staffPasscode: "STAFF-2026",
    },
    {
      id: "reward-guide",
      title: { ja: "デジタル街歩きガイド", en: "Digital City Guide" },
      description: {
        ja: "全達成者向けのデジタルガイド。",
        en: "A digital guide for rally completers.",
      },
      type: "digital",
      redemptionMethod: "view_only",
      requiredStampCount: 6,
    },
  ],
};

export const DEFAULT_PRESENTATIONS: Readonly<Record<string, StampPresentation>> = {
  "spot-a": { channel: "instant", label: "Instant", icon: "⚡", ink: "vermilion" },
  "spot-b": { channel: "qr", label: "QR", icon: "📷", ink: "indigo" },
  "spot-c": { channel: "geo", label: "GPS", icon: "📍", ink: "vermilion" },
  "spot-d": { channel: "instant", label: "Instant", icon: "⚡", ink: "indigo" },
  "spot-e": { channel: "nfc", label: "NFC", icon: "📳", ink: "vermilion" },
  "spot-f": { channel: "geo", label: "GPS", icon: "📍", ink: "indigo" },
};
