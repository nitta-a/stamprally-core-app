import type { StampCondition } from "./conditions.js";

export interface StampDefinition {
  readonly id: string;
  readonly name: string;
  readonly condition: StampCondition;
  readonly order?: number;
}

export interface StampRecord {
  readonly stampId: string;
  readonly acquiredAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface StampRallyState {
  readonly rallyId: string;
  readonly records: ReadonlyArray<StampRecord>;
  readonly updatedAt: string;
}

export interface RallyConfig {
  readonly id: string;
  readonly stamps: ReadonlyArray<StampDefinition>;
  readonly isSequential?: boolean;
}
