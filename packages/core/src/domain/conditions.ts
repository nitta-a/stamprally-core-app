export type VerificationContext =
  | { readonly type: "qr"; readonly token: string }
  | { readonly type: "passcode"; readonly code: string }
  | { readonly type: "gps"; readonly latitude: number; readonly longitude: number }
  | { readonly type: "nfc"; readonly tagId: string }
  | { readonly type: "custom"; readonly value: unknown };
