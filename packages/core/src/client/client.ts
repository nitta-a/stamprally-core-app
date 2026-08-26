import type {
  PublicRallyConfig,
  RallyConfig,
  Result,
  StampError,
  StampRallyState,
  VerificationContext,
} from "../domain/index.js";
import { type ProcessStampValue, processStamp, reconcileRewardStates } from "../engine/index.js";
import { cloneState, type StampStorage } from "./storage.js";

export type StampRallyListener = (state: StampRallyState) => void;
export type StampRallyClientEvent =
  | { readonly type: "checkIn"; readonly stampId: string; readonly state: StampRallyState }
  | { readonly type: "rewardClaimed"; readonly rewardId: string; readonly state: StampRallyState }
  | { readonly type: "syncCompleted"; readonly state: StampRallyState }
  | { readonly type: "error"; readonly error: unknown };
export type StampRallyEventListener = (event: StampRallyClientEvent) => void;
export type Clock = () => string;

const systemClock: Clock = () => new Date().toISOString();

export class StampRallyClient {
  readonly #listeners = new Set<StampRallyListener>();
  readonly #eventListeners = new Set<StampRallyEventListener>();
  #config: RallyConfig;
  readonly #storage: StampStorage;
  readonly #clock: Clock;
  #currentState: StampRallyState | null = null;
  #initialization: Promise<StampRallyState> | null = null;
  #operationQueue: Promise<unknown> = Promise.resolve();

  constructor(config: RallyConfig, storage: StampStorage, clock: Clock = systemClock) {
    this.#config = config;
    this.#storage = storage;
    this.#clock = clock;
  }

  getState(): StampRallyState | null {
    return this.#currentState;
  }

  getConfig(): RallyConfig {
    return this.#config;
  }

  subscribe(listener: StampRallyListener): () => void;
  subscribe(listener: StampRallyEventListener, options: { readonly events: true }): () => void;
  subscribe(
    listener: StampRallyListener | StampRallyEventListener,
    options: { readonly events?: boolean } = {},
  ): () => void {
    if (options.events === true) {
      this.#eventListeners.add(listener as StampRallyEventListener);
      return () => this.#eventListeners.delete(listener as StampRallyEventListener);
    }
    this.#listeners.add(listener as StampRallyListener);
    return () => {
      this.#listeners.delete(listener as StampRallyListener);
    };
  }

  subscribeEvents(listener: StampRallyEventListener): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  async updateConfig(newConfig: PublicRallyConfig): Promise<StampRallyState> {
    return this.#enqueue(async () => {
      const current = await this.initialize();
      this.#config = newConfig;
      const next = this.#reconcileState(cloneState(current), this.#clock());
      await this.#storage.save(next);
      this.#currentState = next;
      this.#initialization = Promise.resolve(next);
      this.#emit(next);
      return next;
    });
  }

  notifyRewardClaimed(rewardId: string, state = this.#currentState): void {
    if (state !== null) this.#emitEvent({ type: "rewardClaimed", rewardId, state });
  }

  notifySyncCompleted(state = this.#currentState): void {
    if (state !== null) this.#emitEvent({ type: "syncCompleted", state });
  }

  init(): Promise<StampRallyState> {
    return this.initialize();
  }

  initialize(): Promise<StampRallyState> {
    if (this.#currentState !== null) {
      return Promise.resolve(this.#currentState);
    }

    if (this.#initialization === null) {
      this.#initialization = this.#storage
        .load(this.#config.id)
        .then((storedState) => {
          const state =
            storedState === null
              ? this.#createEmptyState(this.#clock())
              : this.#reconcileState(cloneState(storedState), storedState.updatedAt);
          this.#currentState = state;
          this.#emit(state);
          return state;
        })
        .catch((error: unknown) => {
          this.#initialization = null;
          throw error;
        });
    }

    return this.#initialization;
  }

  acquire(
    stampId: string,
    context: VerificationContext,
    now: string = this.#clock(),
  ): Promise<Result<ProcessStampValue, StampError>> {
    return this.#enqueue(async () => {
      const currentState = await this.initialize();
      const result = processStamp(currentState, this.#config, stampId, context, now);

      if (!result.ok) {
        this.#emitEvent({ type: "error", error: result.error });
        return result;
      }

      await this.#storage.save(result.value.nextState);
      this.#currentState = result.value.nextState;
      this.#emit(result.value.nextState);
      this.#emitEvent({ type: "checkIn", stampId, state: result.value.nextState });
      return result;
    });
  }

  reset(now: string = this.#clock()): Promise<StampRallyState> {
    return this.#enqueue(async () => {
      const initialization = this.#initialization;
      if (initialization !== null) {
        await initialization.catch(() => undefined);
      }
      await this.#storage.remove(this.#config.id);
      const nextState = this.#createEmptyState(now);
      this.#currentState = nextState;
      this.#initialization = Promise.resolve(nextState);
      this.#emit(nextState);
      return nextState;
    });
  }

  restore(state: StampRallyState): Promise<StampRallyState> {
    return this.#enqueue(async () => {
      const initialization = this.#initialization;
      if (initialization !== null) {
        await initialization.catch(() => undefined);
      }
      if (state.rallyId !== this.#config.id) {
        throw new Error(
          `Cannot restore rally '${state.rallyId}' into client '${this.#config.id}'.`,
        );
      }

      const nextState = this.#reconcileState(cloneState(state), state.updatedAt);
      await this.#storage.save(nextState);
      this.#currentState = nextState;
      this.#initialization = Promise.resolve(nextState);
      this.#emit(nextState);
      return nextState;
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#operationQueue.then(operation, operation);
    this.#operationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  #emit(state: StampRallyState): void {
    for (const listener of this.#listeners) {
      listener(state);
    }
  }

  #emitEvent(event: StampRallyClientEvent): void {
    for (const listener of this.#eventListeners) listener(event);
  }

  #createEmptyState(now: string): StampRallyState {
    const state: StampRallyState = {
      rallyId: this.#config.id,
      records: [],
      ...(this.#config.rewards === undefined
        ? {}
        : {
            rewards: reconcileRewardStates(this.#config.rewards, [], 0, now),
          }),
      updatedAt: now,
    };
    return state;
  }

  #reconcileState(state: StampRallyState, now: string): StampRallyState {
    const configuredStampIds = new Set(this.#config.stamps.map((stamp) => stamp.id));
    const seenStampIds = new Set<string>();
    const records = state.records.filter((record) => {
      if (!configuredStampIds.has(record.stampId) || seenStampIds.has(record.stampId)) return false;
      seenStampIds.add(record.stampId);
      return true;
    });
    if (this.#config.rewards === undefined && state.rewards === undefined) {
      return records.length === state.records.length ? state : { ...state, records };
    }
    return {
      ...state,
      records,
      rewards: reconcileRewardStates(
        this.#config.rewards ?? [],
        state.rewards ?? [],
        records.length,
        now,
      ),
    };
  }
}
