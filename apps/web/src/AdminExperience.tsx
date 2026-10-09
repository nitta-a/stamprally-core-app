import {
  formatDateTimeLocal,
  GeneralSettingsForm,
  JsonConfigIO,
  parseDateTimeLocal,
  RewardItemForm,
  SpotItemForm,
  ThemeEditor,
} from "@stamprally/admin-ui";
import {
  type AdminRallyConfig,
  analyzeRallyExperience,
  DEFAULT_SHEET_THEME,
  type ExperienceIssue,
  type Reward,
  resolveLocalizedText,
  type SpotItem,
  updateLocalizedField,
} from "@stamprally/core";
import { type KeyboardEvent, type ReactElement, useId, useRef, useState } from "react";
import type { DemoLocale } from "./locale.js";
import { text } from "./locale.js";

export interface AdminExperienceProps {
  readonly config: AdminRallyConfig;
  readonly onChange: (config: AdminRallyConfig) => void;
  readonly locale?: DemoLocale;
}

const sections = [
  {
    id: "general",
    label: ["基本情報", "Basics"],
    description: [
      "ラリーの名前と、参加者への案内を整えましょう。",
      "Set the rally name and participant guidance.",
    ],
  },
  {
    id: "spots",
    label: ["スポット", "Places"],
    description: [
      "立ち寄る場所とスタンプの集め方を設定します。",
      "Set the places and how participants collect stamps.",
    ],
  },
  {
    id: "rewards",
    label: ["特典", "Rewards"],
    description: [
      "街を巡る楽しみになる、達成特典を用意しましょう。",
      "Add a reward to celebrate exploring the town.",
    ],
  },
  {
    id: "advanced",
    label: ["詳細設定", "Advanced"],
    description: [
      "スタンプカードの見た目や設定データを管理します。",
      "Manage the stamp card design and configuration data.",
    ],
  },
] as const;
type SectionId = (typeof sections)[number]["id"];

const editorDictionary = {
  en: {
    generalSettings: "General settings",
    title: "Rally title",
    inventoryLimit: "Global inventory limit",
    inventoryLimitPlaceholder: "Unlimited",
    inventoryOverrideHelp: "Reward-specific limits take precedence.",
    inventoryMode: "Inventory aggregation",
    inventoryModeHelp: "Reward-specific settings take precedence.",
    inventoryShared: "Shared across rewards",
    inventoryPerReward: "Managed per reward",
    staffPasscode: "Staff passcode",
    staffPasscodePlaceholder: "Used when a reward has no passcode",
    staffPasscodeHelp: "Place- and reward-specific settings take precedence.",
    spotName: "Place name",
    description: "Description",
    hint: "Hint",
    imageUrl: "Image URL",
    iconUrl: "Icon URL",
    redirectUrlAfterClaim: "Redirect URL after check-in",
    location: "Location",
    latitude: "Latitude",
    longitude: "Longitude",
    address: "Address or landmark",
    prerequisites: "Prerequisite place IDs (comma-separated)",
    externalReferences: "External references",
    metadata: "Metadata",
    condition: "Check-in method",
    conditionType: "Method",
    "condition.qr": "QR code",
    "condition.passcode": "Passcode",
    "condition.gps": "Current location (GPS)",
    "condition.nfc": "NFC tag",
    "condition.custom": "Custom method",
    secretToken: "QR code token",
    qrEntryUrl: "URL opened by QR code",
    passcode: "Passcode",
    caseSensitive: "Case-sensitive",
    radiusMeters: "Check-in radius (m)",
    tagId: "NFC tag ID",
    validatorName: "Validator name",
    addCondition: "Add check-in method",
    removeCondition: "Remove this method",
    removeSpot: "Remove this place",
    rewardTitle: "Reward name",
    requiredSpotCount: "Required stamps",
    rewardType: "Reward type",
    "rewardType.digital": "Digital reward",
    "rewardType.inPerson": "On-site reward",
    redemptionMethod: "Redemption method",
    "redemption.serverClaim": "Verify on server",
    "redemption.manualSlide": "Slide to confirm",
    "redemption.staffPasscode": "Staff passcode",
    "redemption.viewOnly": "Display on screen",
    unlockConditions: "Additional completion rules",
    addUnlockCondition: "Add completion rule",
    stockLimit: "Reward stock limit",
    userClaimLimit: "Redemption limit per person",
    digitalContentUrl: "Digital reward URL",
    validUntil: "Redemption deadline",
    removeReward: "Remove this reward",
    theme: "Stamp card design",
    primaryColor: "Primary color",
    backgroundColor: "Background color",
    cardBackgroundColor: "Card background color",
    textColor: "Text color",
    backgroundImageUrl: "Background image URL",
    completedStampColor: "Collected stamp color",
    slotShape: "Stamp shape",
    "slotShape.circle": "Circle",
    "slotShape.square": "Square",
    "slotShape.rounded": "Rounded",
    gridColumns: "Stamp columns",
    fontFamily: "Font family",
    unclaimedOpacity: "Uncollected stamp opacity",
    jsonConfig: "Admin configuration JSON",
    import: "Import this configuration",
    invalidJson: "Check that the JSON is valid.",
    "availability.editor.openingHours": "Check-in hours",
    "availability.editor.timezone": "Time zone",
    "availability.editor.weekday.0": "Sunday",
    "availability.editor.weekday.1": "Monday",
    "availability.editor.weekday.2": "Tuesday",
    "availability.editor.weekday.3": "Wednesday",
    "availability.editor.weekday.4": "Thursday",
    "availability.editor.weekday.5": "Friday",
    "availability.editor.weekday.6": "Saturday",
    "availability.editor.addHours": "Set hours",
    "availability.editor.opensAt": "Opens at",
    "availability.editor.closesAt": "Closes at",
    "availability.editor.removePeriod": "Remove this time slot",
    "availability.editor.addPeriod": "Add time slot",
    "availability.editor.removeDay": "Remove this weekday",
    "availability.editor.specialDates": "Special hours and closures",
    "availability.editor.date": "Date",
    "availability.editor.closed": "Closed",
    "availability.editor.addSpecialHours": "Add special hours",
    "availability.editor.removeDate": "Remove this date",
    "availability.editor.addSpecialDate": "Add special date",
    "availability.editor.removeOpeningHours": "Remove opening-hour limits",
  },
  ja: {
    generalSettings: "ラリーの基本設定",
    title: "ラリーの名前",
    inventoryLimit: "特典の共通在庫数",
    inventoryLimitPlaceholder: "上限なし",
    inventoryOverrideHelp: "特典ごとの在庫数がある場合は、そちらが優先されます。",
    inventoryMode: "在庫の集計方法",
    inventoryModeHelp: "特典ごとの在庫設定が優先されます。",
    inventoryShared: "全特典で共有",
    inventoryPerReward: "特典ごとに管理",
    staffPasscode: "スタッフ確認用コード",
    staffPasscodePlaceholder: "特典ごとのコードがない場合に使用",
    staffPasscodeHelp: "スポット・特典ごとの設定が優先されます。",
    spotName: "スポット名",
    description: "紹介文",
    hint: "見つけるヒント",
    imageUrl: "写真のURL",
    iconUrl: "アイコンのURL",
    redirectUrlAfterClaim: "スタンプ取得後のリンク",
    location: "場所",
    latitude: "緯度",
    longitude: "経度",
    address: "住所・目印",
    prerequisites: "先に訪れるスポットのID（カンマ区切り）",
    externalReferences: "外部サービスとの連携",
    metadata: "補足データ",
    condition: "スタンプの取得方法",
    conditionType: "確認方法",
    "condition.qr": "QRコード",
    "condition.passcode": "合言葉",
    "condition.gps": "現在地（GPS）",
    "condition.nfc": "NFCタグ",
    "condition.custom": "独自の確認方法",
    secretToken: "QRコードの認証トークン",
    qrEntryUrl: "QRコードから開くURL",
    passcode: "合言葉",
    caseSensitive: "大文字・小文字を区別する",
    radiusMeters: "取得できる範囲（m）",
    tagId: "NFCタグのID",
    validatorName: "検証処理の名前",
    addCondition: "取得方法を追加",
    removeCondition: "この取得方法を削除",
    removeSpot: "このスポットを削除",
    rewardTitle: "特典名",
    requiredSpotCount: "必要なスタンプ数",
    rewardType: "特典の種類",
    "rewardType.digital": "デジタル特典",
    "rewardType.inPerson": "現地で受け取る特典",
    redemptionMethod: "受け取りの確認方法",
    "redemption.serverClaim": "サーバーで確認",
    "redemption.manualSlide": "スライドして確認",
    "redemption.staffPasscode": "スタッフのコードで確認",
    "redemption.viewOnly": "画面で表示",
    unlockConditions: "追加の達成条件",
    addUnlockCondition: "達成条件を追加",
    stockLimit: "特典の在庫数",
    userClaimLimit: "1人あたりの受け取り上限",
    digitalContentUrl: "デジタル特典のURL",
    validUntil: "受け取り期限",
    removeReward: "この特典を削除",
    theme: "スタンプカードのデザイン",
    primaryColor: "メインカラー",
    backgroundColor: "背景色",
    cardBackgroundColor: "カードの背景色",
    textColor: "文字色",
    backgroundImageUrl: "背景画像のURL",
    completedStampColor: "取得済みスタンプの色",
    slotShape: "スタンプの形",
    "slotShape.circle": "丸",
    "slotShape.square": "四角",
    "slotShape.rounded": "角丸",
    gridColumns: "スタンプの列数",
    fontFamily: "書体",
    unclaimedOpacity: "未取得スタンプの濃さ",
    jsonConfig: "管理用設定JSON",
    import: "この設定を読み込む",
    invalidJson: "JSONの形式を確認してください。",
    "availability.editor.openingHours": "スタンプを取得できる時間",
    "availability.editor.timezone": "タイムゾーン",
    "availability.editor.weekday.0": "日曜日",
    "availability.editor.weekday.1": "月曜日",
    "availability.editor.weekday.2": "火曜日",
    "availability.editor.weekday.3": "水曜日",
    "availability.editor.weekday.4": "木曜日",
    "availability.editor.weekday.5": "金曜日",
    "availability.editor.weekday.6": "土曜日",
    "availability.editor.addHours": "受付時間を設定",
    "availability.editor.opensAt": "受付開始",
    "availability.editor.closesAt": "受付終了",
    "availability.editor.removePeriod": "この時間帯を削除",
    "availability.editor.addPeriod": "時間帯を追加",
    "availability.editor.removeDay": "この曜日の設定を削除",
    "availability.editor.specialDates": "特別営業日・休業日",
    "availability.editor.date": "日付",
    "availability.editor.closed": "休業日",
    "availability.editor.addSpecialHours": "特別受付時間を追加",
    "availability.editor.removeDate": "この日付を削除",
    "availability.editor.addSpecialDate": "特別な日付を追加",
    "availability.editor.removeOpeningHours": "時間の制限を解除",
  },
};

const issueMessages: Readonly<Record<string, { ja: string; en: string }>> = {
  availability_blocked_spots: {
    ja: "開催期間中に訪問できないスポットがあります。受付時間を確認してください。",
    en: "Some places are unavailable during the rally. Check their opening hours.",
  },
  unreachable_spots: {
    ja: "訪問できないスポットがあります。先に訪れるスポットの設定を確認してください。",
    en: "Some places cannot be visited. Check their prerequisites.",
  },
  prerequisite_cycle: {
    ja: "訪問順が循環しています。先に訪れるスポットの設定を見直してください。",
    en: "Place prerequisites form a cycle. Review the visit order.",
  },
  impossible_completion: {
    ja: "現在のスポット構成では、ラリーの達成条件を満たせません。",
    en: "The current places cannot satisfy the rally completion rule.",
  },
  completion_availability_conflict: {
    ja: "開催期間中に、ラリーの達成条件を満たすことができません。",
    en: "The completion rule cannot be met during the rally period.",
  },
  strong_order_dependency: {
    ja: "訪問順の制限が多くあります。参加者が自由に巡れるか確認してください。",
    en: "Many visit-order restrictions are set. Check whether participants can complete the route.",
  },
  impossible_reward: {
    ja: "必要なスタンプを集められない特典があります。達成条件を確認してください。",
    en: "A reward requires stamps that cannot be collected. Check its requirements.",
  },
  reward_availability_conflict: {
    ja: "開催期間中に受け取れない特典があります。受付時間を確認してください。",
    en: "A reward cannot be redeemed during the rally period. Check its availability.",
  },
  reward_progress_count_only: {
    ja: "特典はスタンプの個数で達成します。訪れるスポットは自由に選べます。",
    en: "This reward is based on stamp count, so participants can choose which places to visit.",
  },
  reward_expires_before_rally: {
    ja: "開催終了より前に受け取り期限を迎える特典があります。",
    en: "A reward expires before the rally ends.",
  },
  missing_prerequisite: {
    ja: "先に訪れるスポットとして、存在しないIDが指定されています。",
    en: "A prerequisite refers to a place ID that does not exist.",
  },
  gps_without_location: {
    ja: "現在地で取得するスポットに、案内用の場所が設定されていません。",
    en: "A GPS check-in place has no location set.",
  },
  limited_checkin_fallback: {
    ja: "幅広い端末で使える取得方法がありません。合言葉などを追加してください。",
    en: "No check-in method works across a broad range of devices. Add a passcode or similar option.",
  },
  spot_never_open: {
    ja: "受付時間がないスポットがあります。営業時間を設定してください。",
    en: "A place has no opening hours. Set its availability.",
  },
  missing_localization: {
    ja: "参加者に表示する日本語または英語の名前が未入力です。",
    en: "A participant-facing name is missing in Japanese or English.",
  },
};

const checkInLabels = {
  qr: ["QRコード", "QR code"],
  passcode: ["合言葉", "Passcode"],
  gps: ["GPS", "GPS"],
  nfc: ["NFC", "NFC"],
  custom: ["独自の確認", "Custom check-in"],
};

function nextId(prefix: string, items: ReadonlyArray<{ readonly id: string }>): string {
  const existingIds = new Set(items.map(({ id }) => id));
  let number = items.length + 1;
  while (existingIds.has(`${prefix}-${number}`)) number += 1;
  return `${prefix}-${number}`;
}

function issueLabel(issue: ExperienceIssue, locale: DemoLocale): string {
  return issueMessages[issue.code]?.[locale] ?? issue.message;
}

export function AdminExperience(props: AdminExperienceProps): ReactElement {
  const { config, onChange, locale = "ja" } = props;
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const selectedSection = sections.find(({ id: sectionId }) => sectionId === activeSection);
  const issues = analyzeRallyExperience(config, { targetLocales: ["ja", "en"] });
  const actionableIssues = issues.filter(({ severity }) => severity !== "info");
  const completion = config.completion?.condition ?? { type: "all_spots" };
  const timezone = config.availability?.timezone ?? "Asia/Tokyo";
  const title = resolveLocalizedText(config.title, locale);

  function update(patch: Partial<AdminRallyConfig>): void {
    onChange({ ...config, ...patch });
  }

  function changeTab(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft") nextIndex = (index + sections.length - 1) % sections.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = sections.length - 1;
    else return;
    event.preventDefault();
    const section = sections[nextIndex];
    if (section === undefined) return;
    setActiveSection(section.id);
    tabRefs.current[nextIndex]?.focus();
  }

  function updateSpot(next: SpotItem): void {
    update({ spots: config.spots.map((spot) => (spot.id === next.id ? next : spot)) });
  }

  function removeSpot(spotId: string): void {
    const spots = config.spots.filter(({ id: currentId }) => currentId !== spotId);
    update({ spots: spots.map((spot, orderIndex) => ({ ...spot, orderIndex })) });
  }

  function addSpot(): void {
    const spot: SpotItem = {
      id: nextId("spot", config.spots),
      orderIndex: config.spots.length,
      name: { ja: "新しいスポット", en: "New place" },
      conditions: [{ type: "passcode", code: "" }],
    };
    update({ spots: [...config.spots, spot] });
  }

  function updateReward(next: Reward): void {
    update({ rewards: config.rewards.map((reward) => (reward.id === next.id ? next : reward)) });
  }

  function addReward(): void {
    const reward: Reward = {
      id: nextId("reward", config.rewards),
      title: { ja: "新しい特典", en: "New reward" },
      type: "digital",
      redemptionMethod: "view_only",
      requiredStampCount: config.spots.length,
    };
    update({ rewards: [...config.rewards, reward] });
  }

  function downloadConfig(): void {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "rally-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="organizer-workspace">
      <header className="organizer-heading">
        <div>
          <p className="organizer-eyebrow">ORGANIZER WORKSPACE</p>
          <h1>{text(locale, "ラリーの準備", "Prepare your rally")}</h1>
          <p>
            {text(
              locale,
              "小さな発見がつながる、街歩きの体験をつくろう。",
              "Create a walking experience full of small discoveries.",
            )}
          </p>
        </div>
        <span className="organizer-preview-badge">
          {text(locale, "プレビュー編集中", "Editing preview")}
        </span>
      </header>

      <div className="organizer-layout">
        <div className="organizer-editor">
          <div
            className="organizer-tabs"
            role="tablist"
            aria-label={text(locale, "ラリーの設定", "Rally settings")}
          >
            {sections.map((section, index) => (
              <button
                key={section.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${section.id}`}
                aria-selected={activeSection === section.id}
                aria-controls={`${id}-panel`}
                tabIndex={activeSection === section.id ? 0 : -1}
                onClick={() => setActiveSection(section.id)}
                onKeyDown={(event) => changeTab(event, index)}
              >
                <span className="organizer-tab-number" aria-hidden="true">
                  0{index + 1}
                </span>
                {text(locale, section.label[0], section.label[1])}
              </button>
            ))}
          </div>

          <section
            className="organizer-panel"
            id={`${id}-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${activeSection}`}
          >
            <header className="organizer-panel-heading">
              <div>
                <h2>
                  {selectedSection === undefined
                    ? ""
                    : text(locale, selectedSection.label[0], selectedSection.label[1])}
                </h2>
                <p>
                  {selectedSection === undefined
                    ? ""
                    : text(locale, selectedSection.description[0], selectedSection.description[1])}
                </p>
              </div>
              {activeSection === "spots" && (
                <button className="organizer-primary-button" type="button" onClick={addSpot}>
                  {text(locale, "＋ スポットを追加", "+ Add place")}
                </button>
              )}
              {activeSection === "rewards" && (
                <button className="organizer-primary-button" type="button" onClick={addReward}>
                  {text(locale, "＋ 特典を追加", "+ Add reward")}
                </button>
              )}
            </header>

            {activeSection === "general" && (
              <div className="organizer-form">
                <GeneralSettingsForm
                  config={config}
                  onChange={onChange}
                  locale={locale}
                  dictionary={editorDictionary}
                />
                <label>
                  {text(locale, "参加者への案内", "Participant guidance")}
                  <textarea
                    rows={4}
                    value={resolveLocalizedText(config.description ?? "", locale)}
                    placeholder={text(
                      locale,
                      "街の魅力や、巡り方を紹介しましょう。",
                      "Describe what makes the town special and how to explore it.",
                    )}
                    onChange={(event) => {
                      const description = updateLocalizedField(
                        config.description ?? "",
                        locale,
                        event.target.value,
                      );
                      update({ description });
                    }}
                  />
                </label>
                <fieldset>
                  <legend>{text(locale, "開催期間", "Rally period")}</legend>
                  <p className="organizer-field-help">
                    {text(
                      locale,
                      "未入力の場合は、開催期間を制限しません。",
                      "Leave blank for no date limit.",
                    )}
                  </p>
                  <div className="organizer-date-fields">
                    {(["startsAt", "endsAt"] as const).map((key) => (
                      <label key={key}>
                        {key === "startsAt" && text(locale, "開催開始", "Starts")}
                        {key === "endsAt" && text(locale, "開催終了", "Ends")}
                        <input
                          type="datetime-local"
                          value={
                            config.availability?.[key] === undefined
                              ? ""
                              : formatDateTimeLocal(config.availability[key], timezone)
                          }
                          onChange={(event) => {
                            const availability = { ...config.availability, timezone };
                            if (event.target.value === "") delete availability[key];
                            else {
                              const value = parseDateTimeLocal(event.target.value, timezone);
                              if (value === undefined) return;
                              availability[key] = value;
                            }
                            update({ availability });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    {text(locale, "タイムゾーン", "Time zone")}
                    <input
                      value={timezone}
                      onChange={(event) =>
                        update({
                          availability: { ...config.availability, timezone: event.target.value },
                        })
                      }
                    />
                  </label>
                </fieldset>
                <fieldset>
                  <legend>{text(locale, "ラリーの達成条件", "Completion rule")}</legend>
                  <label>
                    {text(locale, "達成するには", "Complete by")}
                    <select
                      value={completion.type}
                      onChange={(event) => {
                        const type = event.target.value;
                        if (type === "all_spots") update({ completion: { condition: { type } } });
                        else if (type === "stamp_count")
                          update({
                            completion: { condition: { type, count: config.spots.length } },
                          });
                        else if (type === "stamps")
                          update({ completion: { condition: { type, stampIds: [] } } });
                      }}
                    >
                      <option value="all_spots">
                        {text(locale, "すべてのスポットを訪れる", "Visiting every place")}
                      </option>
                      <option value="stamp_count">
                        {text(
                          locale,
                          "決まった数のスタンプを集める",
                          "Collecting a set number of stamps",
                        )}
                      </option>
                      <option value="stamps">
                        {text(locale, "指定したスポットを訪れる", "Visiting selected places")}
                      </option>
                    </select>
                  </label>
                  {completion.type === "stamp_count" && (
                    <label>
                      {text(locale, "達成に必要なスタンプ数", "Stamps required to complete")}
                      <input
                        type="number"
                        min={1}
                        value={completion.count}
                        onChange={(event) =>
                          update({
                            completion: {
                              condition: { type: "stamp_count", count: Number(event.target.value) },
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  {completion.type === "stamps" && (
                    <div className="organizer-spot-selection">
                      {config.spots.map((spot) => (
                        <label key={spot.id}>
                          <input
                            type="checkbox"
                            checked={completion.stampIds.includes(spot.id)}
                            onChange={(event) => {
                              const stampIds = completion.stampIds.filter(
                                (spotId) => spotId !== spot.id,
                              );
                              if (event.target.checked) stampIds.push(spot.id);
                              update({ completion: { condition: { type: "stamps", stampIds } } });
                            }}
                          />
                          {resolveLocalizedText(spot.name, locale)}
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              </div>
            )}

            {activeSection === "spots" && (
              <div className="organizer-entity-list">
                {config.spots.length === 0 && (
                  <p className="organizer-empty">
                    {text(
                      locale,
                      "最初のスポットを追加して、街歩きのルートをつくりましょう。",
                      "Add your first place to create a walking route.",
                    )}
                  </p>
                )}
                {config.spots.map((spot, index) => (
                  <details className="organizer-entity" key={spot.id}>
                    <summary>
                      <span className="organizer-entity-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="organizer-entity-title">
                        <strong>
                          {resolveLocalizedText(spot.name, locale) ||
                            text(locale, "名前を入力してください", "Enter a name")}
                        </strong>
                        <span>
                          {spot.conditions
                            .map(({ type }) => checkInLabels[type][locale === "ja" ? 0 : 1])
                            .join(" / ")}
                          {spot.conditions.length === 0 &&
                            text(locale, "取得方法が未設定です", "No check-in method set")}
                        </span>
                      </span>
                      <span className="organizer-edit-label">
                        {text(locale, "編集する", "Edit")}
                      </span>
                    </summary>
                    <div className="organizer-form organizer-entity-form">
                      <SpotItemForm
                        spot={spot}
                        locale={locale}
                        dictionary={editorDictionary}
                        onChange={updateSpot}
                        onRemove={() => removeSpot(spot.id)}
                      />
                    </div>
                  </details>
                ))}
              </div>
            )}

            {activeSection === "rewards" && (
              <div className="organizer-entity-list">
                {config.rewards.length === 0 && (
                  <p className="organizer-empty">
                    {text(
                      locale,
                      "特典を追加して、参加者のゴールを用意しましょう。",
                      "Add a reward for participants to work toward.",
                    )}
                  </p>
                )}
                {config.rewards.map((reward) => (
                  <details className="organizer-entity" key={reward.id}>
                    <summary>
                      <span className="organizer-reward-icon" aria-hidden="true">
                        ✳
                      </span>
                      <span className="organizer-entity-title">
                        <strong>
                          {resolveLocalizedText(reward.title, locale) ||
                            text(locale, "名前を入力してください", "Enter a name")}
                        </strong>
                        <span>
                          {text(
                            locale,
                            `スタンプ ${reward.requiredStampCount} 個で達成`,
                            `Earn ${reward.requiredStampCount} stamps to complete`,
                          )}
                        </span>
                      </span>
                      <span className="organizer-edit-label">
                        {text(locale, "編集する", "Edit")}
                      </span>
                    </summary>
                    <div className="organizer-form organizer-entity-form">
                      <RewardItemForm
                        reward={reward}
                        locale={locale}
                        dictionary={editorDictionary}
                        onChange={updateReward}
                        onRemove={() =>
                          update({
                            rewards: config.rewards.filter(
                              ({ id: rewardId }) => rewardId !== reward.id,
                            ),
                          })
                        }
                      />
                    </div>
                  </details>
                ))}
              </div>
            )}

            {activeSection === "advanced" && (
              <div className="organizer-form">
                <ThemeEditor
                  theme={config.theme ?? DEFAULT_SHEET_THEME}
                  locale={locale}
                  dictionary={editorDictionary}
                  onChange={(theme) => update({ theme })}
                />
                <section
                  className="organizer-config-io"
                  aria-label={text(locale, "設定データの管理", "Configuration data")}
                >
                  <h3>{text(locale, "設定データ", "Configuration data")}</h3>
                  <p>
                    {text(
                      locale,
                      "管理用JSONには合言葉などの認証情報が含まれます。運営者間で管理してください。",
                      "The admin JSON contains credentials such as passcodes. Share it only with organizers.",
                    )}
                  </p>
                  <button type="button" onClick={downloadConfig}>
                    {text(locale, "設定をダウンロード", "Download settings")}
                  </button>
                  <details>
                    <summary>
                      {text(locale, "JSONから設定を読み込む", "Import settings from JSON")}
                    </summary>
                    <JsonConfigIO
                      config={config}
                      locale={locale}
                      dictionary={editorDictionary}
                      onImport={onChange}
                    />
                  </details>
                </section>
              </div>
            )}
          </section>
        </div>

        <aside
          className="organizer-sidebar"
          aria-label={text(locale, "ラリー設定の概要", "Rally summary")}
        >
          <section className="organizer-summary-card">
            <span className="organizer-eyebrow">YOUR RALLY</span>
            <h2>{title || text(locale, "名前を入力してください", "Enter a name")}</h2>
            <p>
              {text(
                locale,
                "参加者と出会う、小さな街の旅。",
                "A little town journey to share with participants.",
              )}
            </p>
            <dl className="organizer-counts">
              <div>
                <dt>{text(locale, "スポット", "Places")}</dt>
                <dd>
                  {config.spots.length}
                  <span>{text(locale, "か所", "places")}</span>
                </dd>
              </div>
              <div>
                <dt>{text(locale, "特典", "Rewards")}</dt>
                <dd>
                  {config.rewards.length}
                  <span>{text(locale, "種類", "types")}</span>
                </dd>
              </div>
            </dl>
            <p className="organizer-local-note">
              {text(
                locale,
                "このブラウザーのプレビュー設定です。変更は参加者プレビューに反映されます。公開・配信は行いません。",
                "These preview settings are stored in this browser and appear in the participant view. Nothing is published or sent.",
              )}
            </p>
          </section>

          <section
            className="organizer-preflight-card"
            aria-label={text(locale, "実施前チェック", "Preflight check")}
          >
            <h2>
              <span aria-hidden="true">✓</span> {text(locale, "実施前チェック", "Preflight check")}
            </h2>
            {actionableIssues.length === 0 && (
              <div className="organizer-check-clear">
                <strong>
                  {text(locale, "設定上の問題はありません", "No configuration issues found")}
                </strong>
                <p>
                  {text(
                    locale,
                    "参加者プレビューで、実際の巡り方も確認しましょう。",
                    "Review the route in the participant preview.",
                  )}
                </p>
              </div>
            )}
            {actionableIssues.length > 0 && (
              <div className="organizer-check-issues" aria-live="polite">
                <strong>
                  {text(
                    locale,
                    `${actionableIssues.length} 件の確認事項`,
                    `${actionableIssues.length} item(s) to review`,
                  )}
                </strong>
                <ul>
                  {actionableIssues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.path ?? index}`} data-severity={issue.severity}>
                      {issueLabel(issue, locale)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="organizer-field-help">
              {text(
                locale,
                "設定の整合性を確認します。現地での動作確認は別途必要です。",
                "This checks configuration consistency. Test the experience on-site separately.",
              )}
            </p>
          </section>

          <div className="organizer-tip">
            <span className="organizer-eyebrow">
              {text(locale, "ひとつ、ヒント", "A quick tip")}
            </span>
            <p>
              {text(
                locale,
                "合言葉やQRコードは、参加者が迷わず見つけられる場所に掲示しましょう。",
                "Place passcodes and QR codes somewhere participants can easily find them.",
              )}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
