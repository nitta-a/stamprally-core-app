import type {
  RallyConfig,
  Result,
  StampError,
  StampRallyState,
  VerificationContext,
} from "../domain/index.js";
import { type ProcessStampValue, processStamp, reconcileRewardStates } from "../engine/index.js";
import { cloneState, type StampStorage } from "./storage.js";

export type StampRallyListener = (state: StampRallyState) => void;
export type Clock = () => string;

const systemClock: Clock = () => new Date().toISOString();

export class StampRallyClient {
  readonly #listeners = new Set<StampRallyListener>();
  readonly #config: RallyConfig;
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

  subscribe(listener: StampRallyListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
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
        return result;
      }

      await this.#storage.save(result.value.nextState);
      this.#currentState = result.value.nextState;
      this.#emit(result.value.nextState);
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
    if (this.#config.rewards === undefined && state.rewards === undefined) return state;
    return {
      ...state,
      rewards: reconcileRewardStates(
        this.#config.rewards ?? [],
        state.rewards ?? [],
        state.records.length,
        now,
      ),
    };
  }
}
