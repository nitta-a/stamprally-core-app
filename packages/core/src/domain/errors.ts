export type StampError =
  | {
      readonly code: "STAMP_NOT_FOUND";
      readonly stampId: string;
    }
  | {
      readonly code: "STAMP_ALREADY_ACQUIRED";
      readonly stampId: string;
    }
  | {
      readonly code: "STAMP_OUT_OF_ORDER";
      readonly stampId: string;
      readonly expectedStampId: string;
    }
  | {
      readonly code: "CONDITION_NOT_MET";
      readonly stampId: string;
    };

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
