import type { StampRallyState, StampRecord } from "../domain/index.js";

export interface StampStorage {
  load(rallyId: string): Promise<StampRallyState | null>;
  save(state: StampRallyState): Promise<void>;
}

function cloneRecord(record: StampRecord): StampRecord {
  return record.metadata === undefined
    ? { ...record }
    : { ...record, metadata: { ...record.metadata } };
}

export function cloneState(state: StampRallyState): StampRallyState {
  return {
    ...state,
    records: state.records.map(cloneRecord),
  };
}

export class InMemoryStorage implements StampStorage {
  readonly #states = new Map<string, StampRallyState>();

  async load(rallyId: string): Promise<StampRallyState | null> {
    const state = this.#states.get(rallyId);
    return state === undefined ? null : cloneState(state);
  }

  async save(state: StampRallyState): Promise<void> {
    this.#states.set(state.rallyId, cloneState(state));
  }
}
