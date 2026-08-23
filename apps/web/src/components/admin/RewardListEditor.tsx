import type { RewardItem, SupportedLocale } from "@stamprally/core";
import { getMessages } from "../../locales/index.js";
import { LocalizedFields } from "./LocalizedFields.js";

interface RewardListEditorProps {
  readonly rewards: ReadonlyArray<RewardItem>;
  readonly locale: SupportedLocale;
  readonly onChange: (rewards: ReadonlyArray<RewardItem>) => void;
  readonly onAdd: () => void;
}

export function RewardListEditor({ rewards, locale, onChange, onAdd }: RewardListEditorProps) {
  const messages = getMessages(locale);
  const update = (index: number, reward: RewardItem) =>
    onChange(rewards.map((item, itemIndex) => (itemIndex === index ? reward : item)));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rewards.length) return;
    const next = [...rewards];
    const current = next[index];
    const other = next[target];
    if (current === undefined || other === undefined) return;
    next[index] = other;
    next[target] = current;
    onChange(next);
  };
  return (
    <section className="admin-section">
      <div className="admin-section__heading">
        <h2>{messages.rewardsEditor}</h2>
        <button type="button" className="primary-button" onClick={onAdd}>
          {messages.addReward}
        </button>
      </div>
      {rewards.map((reward, index) => (
        <article className="admin-card admin-item" key={reward.id}>
          <header className="admin-item__header">
            <strong>{reward.id}</strong>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                {messages.moveUp}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={index === rewards.length - 1}
                onClick={() => move(index, 1)}
              >
                {messages.moveDown}
              </button>
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={() => onChange(rewards.filter((_, itemIndex) => itemIndex !== index))}
              >
                {messages.delete}
              </button>
            </div>
          </header>
          <LocalizedFields
            id={`reward-${reward.id}-title`}
            label={messages.title}
            value={reward.title}
            requiredJapanese={true}
            fallbackHelp={messages.englishFallback}
            onChange={(title) => update(index, { ...reward, title })}
          />
          <LocalizedFields
            id={`reward-${reward.id}-description`}
            label={messages.description}
            value={reward.description}
            multiline={true}
            requiredJapanese={true}
            fallbackHelp={messages.englishFallback}
            onChange={(description) => update(index, { ...reward, description })}
          />
          <div className="editor-grid editor-grid--three">
            <label>
              {messages.rewardType}
              <select
                value={reward.type}
                onChange={(event) =>
                  update(index, { ...reward, type: event.target.value as RewardItem["type"] })
                }
              >
                <option value="digital">digital</option>
                <option value="in_person">in_person</option>
              </select>
            </label>
            <label>
              {messages.redemptionMethod}
              <select
                value={reward.redemptionMethod}
                onChange={(event) =>
                  update(index, {
                    ...reward,
                    redemptionMethod: event.target.value as RewardItem["redemptionMethod"],
                  })
                }
              >
                <option value="manual_slide">manual_slide</option>
                <option value="staff_passcode">staff_passcode</option>
                <option value="view_only">view_only</option>
              </select>
            </label>
            <label>
              {messages.requiredStampCount}
              <input
                type="number"
                min="0"
                step="1"
                value={reward.requiredStampCount}
                onChange={(event) =>
                  update(index, { ...reward, requiredStampCount: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <label>
            {messages.digitalContentUrl}
            <input
              value={reward.digitalContentUrl ?? ""}
              onChange={(event) =>
                update(index, {
                  ...reward,
                  ...(event.target.value === ""
                    ? { digitalContentUrl: undefined }
                    : { digitalContentUrl: event.target.value }),
                } as RewardItem)
              }
            />
          </label>
          {reward.redemptionMethod === "staff_passcode" && (
            <label>
              {messages.staffPasscode}
              <input
                type="password"
                value={reward.staffPasscode ?? ""}
                onChange={(event) =>
                  update(index, { ...reward, staffPasscode: event.target.value })
                }
              />
            </label>
          )}
        </article>
      ))}
    </section>
  );
}
