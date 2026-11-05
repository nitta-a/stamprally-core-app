import { type AdminRallyConfig, toPublicConfig } from "@stamprally/core";

export const DEMO_STOPS: Readonly<
  Record<
    string,
    {
      code: string;
      symbol: string;
    }
  >
> = {
  welcome: {
    code: "OPEN",
    symbol: "◈",
  },
  park: {
    code: "RIVER",
    symbol: "≋",
  },
  cafe: {
    code: "COFFEE",
    symbol: "☕",
  },
  bookshop: {
    code: "BOOK",
    symbol: "▤",
  },
};

export const DEFAULT_ADMIN_CONFIG: AdminRallyConfig = {
  id: "demo-rally",
  version: "2",
  title: { ja: "こもれび街歩きラリー", en: "Komorebi Town Walk" },
  description: {
    ja: "川沿いを歩いて、喫茶店でひと休み。本屋の棚で、今日の一冊に出会う。いつものまちの小さな発見を、スタンプと一緒に集めましょう。架空のまちを楽しむ体験デモです。",
    en: "Follow the riverside, take a café break, and find your next read at a little bookshop. Collect stamps and small discoveries along the way. This is a demo set in a fictional neighborhood.",
  },
  theme: {
    primaryColor: "#286455",
    backgroundColor: "#f8f5ed",
    cardBackgroundColor: "#fffef9",
    textColor: "#253e35",
    slotShape: "rounded",
    gridColumns: 4,
    completedStampColor: "#286455",
    unclaimedOpacity: 1,
    fontFamily: "serif",
  },
  completion: { condition: { type: "stamp_count", count: 3 } },
  spots: [
    {
      id: "welcome",
      orderIndex: 0,
      name: { ja: "こもれび案内所", en: "Komorebi Welcome Center" },
      description: {
        ja: "木の看板が目印の、小さなまちの案内所。",
        en: "A little welcome center with a wooden sign.",
      },
      hint: {
        ja: "スポットに掲示された合言葉を入力してください。",
        en: "Enter the passcode displayed at the place.",
      },
      conditions: [{ type: "passcode", code: "OPEN" }],
    },
    {
      id: "park",
      orderIndex: 1,
      name: { ja: "川沿いの遊歩道", en: "Riverside Promenade" },
      description: {
        ja: "水の音と木々の揺れる音を聞きながら、ゆっくり歩く緑の小道。ベンチでひと息つくのもおすすめです。",
        en: "Take the green path beside the river, listen to the trees, and pause on a bench.",
      },
      hint: {
        ja: "スポットに掲示された合言葉を入力してください。",
        en: "Enter the passcode displayed at the place.",
      },
      conditions: [{ type: "passcode", code: "RIVER" }],
      prerequisites: ["welcome"],
    },
    {
      id: "cafe",
      orderIndex: 2,
      name: { ja: "喫茶こもれび", en: "Komorebi Café" },
      description: {
        ja: "窓辺に午後の光が差し込む喫茶店。好きな飲み物を片手に、まちの時間を味わいましょう。",
        en: "A friendly café with sunlight by the window. Enjoy the neighborhood at your own pace.",
      },
      hint: {
        ja: "スポットに掲示された合言葉を入力してください。",
        en: "Enter the passcode displayed at the place.",
      },
      conditions: [{ type: "passcode", code: "COFFEE" }],
      prerequisites: ["welcome"],
    },
    {
      id: "bookshop",
      orderIndex: 3,
      name: { ja: "まちの小さな本屋", en: "The Little Bookshop" },
      description: {
        ja: "店主が選んだ本が並ぶ、路地の本屋。旅の本や絵本の中に、次の散歩のヒントがあるかもしれません。",
        en: "Browse the owner's favorite books in a quiet side street. A new story might inspire your next walk.",
      },
      hint: {
        ja: "スポットに掲示された合言葉を入力してください。",
        en: "Enter the passcode displayed at the place.",
      },
      conditions: [{ type: "passcode", code: "BOOK" }],
      prerequisites: ["welcome"],
    },
  ],
  rewards: [
    {
      id: "gift",
      title: { ja: "街歩きの記念カード", en: "Your Town Walk Keepsake" },
      description: {
        ja: "こもれびのまちを描いたデジタル記念カードです。",
        en: "A digital keepsake of Komorebi Town.",
      },
      type: "digital",
      redemptionMethod: "view_only",
      requiredStampCount: 3,
      digitalContentUrl: "/walk-illustration.svg",
    },
  ],
};

export const DEFAULT_RALLY_CONFIG = toPublicConfig(DEFAULT_ADMIN_CONFIG);
