import { type AdminRallyConfig, toPublicConfig } from "@stamprally/core";
export const DEFAULT_ADMIN_CONFIG: AdminRallyConfig = {
  id: "demo-rally",
  version: "1",
  title: { ja: "街歩きスタンプラリー", en: "City Walk Rally" },
  spots: [
    {
      id: "welcome",
      orderIndex: 0,
      name: { ja: "入口", en: "Welcome" },
      conditions: [{ type: "passcode", code: "OPEN" }],
    },
    {
      id: "park",
      orderIndex: 1,
      name: { ja: "公園", en: "Park" },
      conditions: [{ type: "gps", latitude: 35.681236, longitude: 139.767125, radiusMeters: 150 }],
      prerequisites: ["welcome"],
    },
  ],
  rewards: [
    {
      id: "gift",
      title: { ja: "記念品", en: "Gift" },
      type: "digital",
      redemptionMethod: "view_only",
      requiredStampCount: 2,
    },
  ],
};
export const DEFAULT_RALLY_CONFIG = toPublicConfig(DEFAULT_ADMIN_CONFIG);
