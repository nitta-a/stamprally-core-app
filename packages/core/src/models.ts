/**
 * Branded identifiers keep values from different parts of the domain from
 * being exchanged accidentally while remaining plain strings at runtime.
 */
export type RallyId = string & { readonly __brand: "RallyId" };
export type SpotId = string & { readonly __brand: "SpotId" };
export type UserId = string & { readonly __brand: "UserId" };

export type Metadata = Readonly<Record<string, unknown>>;

/** A locale-independent fallback plus zero or more locale-specific values. */
export interface LocalizedText<TLocale extends string = string> {
  readonly default: string;
  readonly translations: Readonly<Partial<Record<TLocale, string>>>;
}

/** A reference to an entity owned by an external system. */
export interface ExternalReference {
  readonly systemId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly attributes?: Metadata;
}

/** Public, non-secret configuration for one check-in location. */
export interface SpotDefinition<TLocale extends string = string> {
  readonly id: SpotId;
  readonly name: LocalizedText<TLocale>;
  readonly description?: LocalizedText<TLocale>;
  readonly hint?: LocalizedText<TLocale>;
  readonly order?: number;
  readonly iconUrl?: string;
  readonly imageUrl?: string;
  readonly externalReference?: ExternalReference;
  readonly metadata?: Metadata;
  readonly verification: VerificationRequirement;
  readonly dependsOn?: ReadonlyArray<SpotId>;
}

/** Public description of a verifier selected at runtime through DI. */
export interface VerificationRequirement {
  readonly pluginId: string;
  /** Public parameters only; secrets belong to SpotVerificationSecret. */
  readonly parameters?: Metadata;
}

/** Public configuration safe to distribute to a browser client. */
export interface RallyDefinition<TLocale extends string = string> {
  readonly id: RallyId;
  readonly title: LocalizedText<TLocale>;
  readonly description?: LocalizedText<TLocale>;
  readonly spots: ReadonlyArray<SpotDefinition<TLocale>>;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly externalReference?: ExternalReference;
  readonly metadata?: Metadata;
}

export interface VerificationCoordinates {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
}

/** Server-only material used by a verifier. Never include this in a public definition. */
export interface SpotVerificationSecret {
  readonly spotId: SpotId;
  readonly pluginId: string;
  readonly secret?: string | Readonly<Uint8Array>;
  readonly expectedValue?: string;
  readonly coordinates?: VerificationCoordinates;
  readonly metadata?: Metadata;
}

/** Server-only configuration composed from a public definition and secrets. */
export interface ServerRallyConfig<TLocale extends string = string> {
  readonly definition: RallyDefinition<TLocale>;
  readonly verificationSecrets: ReadonlyArray<SpotVerificationSecret>;
  readonly schemaVersion: SchemaVersion;
  readonly metadata?: Metadata;
}

export type SchemaVersion = number;

export interface StampRecord {
  readonly stampId: SpotId;
  readonly acquiredAt: string;
  readonly verificationPluginId?: string;
  readonly metadata?: Metadata;
}

export interface RallyProgress {
  readonly rallyId: RallyId;
  readonly userId: UserId;
  readonly stamps: ReadonlyArray<StampRecord>;
  /** Monotonically increasing revision used for optimistic locking. */
  readonly stateSequence: number;
  readonly schemaVersion: SchemaVersion;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly metadata?: Metadata;
}

export interface StorageSaveRequest {
  readonly progress: RallyProgress;
  readonly expectedStateSequence: number;
  readonly idempotencyKey: string;
}

export type StorageSaveOutcome =
  | {
      readonly status: "saved";
      readonly progress: RallyProgress;
      readonly idempotent: boolean;
    }
  | {
      readonly status: "conflict";
      readonly current: RallyProgress | null;
    };

/** Persistence boundary. Implementations own transactions and concurrency control. */
export interface StorageAdapter {
  load(rallyId: RallyId, userId: UserId): Promise<RallyProgress | null>;
  save(request: StorageSaveRequest): Promise<StorageSaveOutcome>;
}

export interface AuthContextAdapter<TRequest = unknown> {
  getUserId(request: TRequest): Promise<UserId | null> | UserId | null;
}

export interface ValidationInput<TProof = unknown> {
  readonly rallyId: RallyId;
  readonly spotId: SpotId;
  readonly userId: UserId;
  readonly proof: TProof;
  readonly requestedAt: string;
  readonly publicParameters?: Metadata;
}

export type ValidationOutcome =
  | {
      readonly valid: true;
      readonly reason?: string;
      readonly metadata?: Metadata;
    }
  | {
      readonly valid: false;
      readonly code: string;
      readonly reason?: string;
      readonly metadata?: Metadata;
    };

/** Pluggable verifier for GPS, TOTP/HMAC, signatures, or application rules. */
export interface ConditionVerifierPlugin<TProof = unknown> {
  readonly id: string;
  verify(
    input: ValidationInput<TProof>,
    secret: SpotVerificationSecret,
  ): Promise<ValidationOutcome> | ValidationOutcome;
}

export interface CheckInAttemptAuditEntry {
  readonly rallyId: RallyId;
  readonly spotId: SpotId;
  readonly userId: UserId;
  readonly attemptedAt: string;
  readonly outcome: ValidationOutcome;
  readonly idempotencyKey?: string;
  /** Use a digest or other redacted representation; never require raw proof data. */
  readonly proofDigest?: string;
  readonly metadata?: Metadata;
}

export interface AuditLoggerAdapter {
  logCheckInAttempt(entry: CheckInAttemptAuditEntry): Promise<void>;
}

export interface StampAcquiredEvent {
  readonly type: "stampAcquired";
  readonly rallyId: RallyId;
  readonly spotId: SpotId;
  readonly userId: UserId;
  readonly record: StampRecord;
}

export interface RallyCompletedEvent {
  readonly type: "rallyCompleted";
  readonly rallyId: RallyId;
  readonly userId: UserId;
  readonly completedAt: string;
}

export type RallyEvent = StampAcquiredEvent | RallyCompletedEvent;

export interface EventPublisherAdapter {
  publish(event: RallyEvent): Promise<void>;
}

export interface SystemClockAdapter {
  now(): string;
}

export interface IdGeneratorAdapter {
  generate(): string;
}

export interface StateMigrator {
  migrate(state: unknown, fromVersion: SchemaVersion, toVersion: SchemaVersion): RallyProgress;
}
