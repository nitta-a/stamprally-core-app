import { InMemoryStorage, type RallyConfig, type StampError } from "@stamprally/core";
import { useStampRally } from "@stamprally/react";
import { type FormEvent, useState } from "react";

const config: RallyConfig = {
  id: "tokyo-demo",
  isSequential: true,
  stamps: [
    {
      id: "station",
      name: "スタート駅",
      order: 1,
      condition: { type: "token", token: "START" },
    },
    {
      id: "park",
      name: "中央公園",
      order: 2,
      condition: { type: "token", token: "PARK" },
    },
    {
      id: "museum",
      name: "ゴール博物館",
      order: 3,
      condition: { type: "token", token: "GOAL" },
    },
  ],
};

const storage = new InMemoryStorage();

function describeError(error: StampError | Error): string {
  if (error instanceof Error) return error.message;

  switch (error.code) {
    case "STAMP_NOT_FOUND":
      return "対象のスタンプが見つかりません。";
    case "STAMP_ALREADY_ACQUIRED":
      return "このスタンプは取得済みです。";
    case "STAMP_OUT_OF_ORDER":
      return "先に前のスタンプを取得してください。";
    case "CONDITION_NOT_MET":
      return "トークンが一致しません。";
  }
}

export function App() {
  const { state, progress, isLoading, error, acquire } = useStampRally(config, storage);
  const [token, setToken] = useState("");

  const acquiredIds = new Set(state?.records.map((record) => record.stampId) ?? []);
  const nextStamp = config.stamps.find((stamp) => !acquiredIds.has(stamp.id));

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (nextStamp === undefined || token.trim() === "") return;

    try {
      const result = await acquire(nextStamp.id, { type: "token", token: token.trim() });
      if (result.ok) setToken("");
    } catch {
      // Storage failures are already exposed through the hook's error state.
    }
  }

  return (
    <main className="page-shell">
      <section className="rally-card">
        <header>
          <p className="eyebrow">@stamprally/core demo</p>
          <h1>街めぐりスタンプラリー</h1>
          <p className="description">
            順番にトークンを入力して、純粋な状態遷移エンジンの動作を確認できます。
          </p>
        </header>

        <section aria-labelledby="progress-heading" className="progress-section">
          <div className="progress-label">
            <h2 id="progress-heading">進捗</h2>
            <strong>
              {progress.acquired} / {progress.total}
            </strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="スタンプ取得進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.percentage)}
          >
            <div className="progress-fill" style={{ width: `${progress.percentage}%` }} />
          </div>
        </section>

        {isLoading ? (
          <p className="status">状態を読み込んでいます…</p>
        ) : progress.isComplete ? (
          <div className="complete-message" role="status">
            コンプリート！すべてのスタンプを取得しました。
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="token-form">
            <label htmlFor="token">
              次のスポット: <strong>{nextStamp?.name}</strong>
            </label>
            <div className="input-row">
              <input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="トークンを入力"
                autoComplete="off"
              />
              <button type="submit" disabled={token.trim() === ""}>
                スタンプ取得
              </button>
            </div>
            <p className="hint">デモ用トークン: START → PARK → GOAL</p>
          </form>
        )}

        {error !== null && (
          <p className="error-message" role="alert">
            {describeError(error)}
          </p>
        )}

        <section aria-labelledby="stamp-list-heading" className="stamp-section">
          <h2 id="stamp-list-heading">スタンプ一覧</h2>
          <ol className="stamp-list">
            {config.stamps.map((stamp) => {
              const record = state?.records.find((item) => item.stampId === stamp.id);
              return (
                <li
                  className={record === undefined ? "stamp pending" : "stamp acquired"}
                  key={stamp.id}
                >
                  <span className="stamp-mark" aria-hidden="true">
                    {record === undefined ? "○" : "✓"}
                  </span>
                  <span>
                    <strong>{stamp.name}</strong>
                    <small>
                      {record === undefined
                        ? "未取得"
                        : new Date(record.acquiredAt).toLocaleString("ja-JP")}
                    </small>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <footer>進捗はメモリ内にのみ保存され、ページの再読み込みでリセットされます。</footer>
      </section>
    </main>
  );
}
