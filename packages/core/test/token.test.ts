import { describe, expect, it } from "vitest";
import { createSecureToken, verifySecureToken } from "../src/index.js";

describe("secure recovery tokens", () => {
  it("signs and encrypts a payload", async () => {
    const token = await createSecureToken({ rallyId: "demo", value: "private" }, "secret", {
      encrypt: true,
    });
    expect(token.startsWith("sr3.e.")).toBe(true);
    const result = await verifySecureToken<{ rallyId: string; value: string }>(token, "secret");
    expect(result).toEqual({
      ok: true,
      valid: true,
      payload: { rallyId: "demo", value: "private" },
    });
  });

  it("detects tampering and expiry", async () => {
    const token = await createSecureToken({ exp: Math.floor(Date.now() / 1000) - 1 }, "secret");
    const expired = await verifySecureToken(token, "secret");
    expect(expired.ok ? "valid" : expired.error.code).toBe("EXPIRED");

    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}x.${parts[3]}`;
    const invalid = await verifySecureToken(tampered, "secret");
    expect(invalid.ok ? "valid" : invalid.error.code).toBe("INVALID_SIGNATURE");
  });
});
