export type StampCondition =
  | { readonly type: "instant" }
  | { readonly type: "token"; readonly token: string }
  | {
      readonly type: "geo";
      readonly latitude: number;
      readonly longitude: number;
      readonly radiusMeters: number;
    }
  | {
      readonly type: "composite";
      readonly operator: "AND" | "OR";
      readonly conditions: ReadonlyArray<StampCondition>;
    }
  | {
      readonly type: "time_window";
      readonly startsAt: string;
      readonly endsAt: string;
      readonly condition: StampCondition;
    };

export type VerificationContext =
  | { readonly type: "instant" }
  | { readonly type: "token"; readonly token: string }
  | {
      readonly type: "geo";
      readonly currentLatitude: number;
      readonly currentLongitude: number;
    }
  | {
      readonly type: "composite";
      readonly contexts: ReadonlyArray<VerificationContext>;
    };
