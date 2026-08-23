import type {
  RallyConfig,
  Result,
  StampError,
  StampRallyState,
  VerificationContext,
} from "../domain/index.js";
import { type ProcessStampValue, processStamp } from "../engine/index.js";
import { cloneState, type StampStorage } from "./storage.js";

export type StampRallyListener = (state: StampRallyState) => void;
export type Clock = () => string;

const systemClock: Clock = () => new Date().toISOString();

export class StampRallyClient {
  readonly #listeners = new Set<StampRallyListener>();
  readonly #config: RallyConfig;
  readonly #storage: StampStorage;
  readonly #clock: Clock;
  #state: StampRallyState | null = null;
  #initialization: Promise<StampRallyState> | null = null;
  #operationQueue: Promise<unknown> = Promise.resolve();

  constructor(config: RallyConfig, storage: StampStorage, clock: Clock = systemClock) {
    this.#config = config;
    this.#storage = storage;
    this.#clock = clock;
  }

  getState(): StampRallyState | null {
    return this.#state;
  }

  subscribe(listener: StampRallyListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  initialize(): Promise<StampRallyState> {
    if (this.#state !== null) {
      return Promise.resolve(this.#state);
    }

    if (this.#initialization === null) {
      this.#initialization = this.#storage
        .load(this.#config.id)
        .then((storedState) => {
          const state =
            storedState === null
              ? {
                  rallyId: this.#config.id,
                  records: [],
                  updatedAt: this.#clock(),
                }
              : cloneState(storedState);
          this.#state = state;
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
      this.#state = result.value.nextState;
      this.#emit(result.value.nextState);
      return result;
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
}
