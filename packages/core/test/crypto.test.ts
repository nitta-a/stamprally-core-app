import { describe, expect, it } from "vitest";
import {
  createSecureToken,
  createSignedSnapshotToken,
  verifySecureToken,
  verifySnapshotToken,
} from "../src/index.js";

describe("secure progress tokens", () => {
  it("round-trips plain and encrypted payloads with string and byte secrets", async () => {
    const payload = { rallyId: "rally", userId: "user" } as const;
    const plain = await createSecureToken(payload, "secret");
    expect(plain.startsWith("sr3.p.")).toBe(true);
    await expect(verifySecureToken<typeof payload>(plain, "secret")).resolves.toMatchObject({
      ok: true,
      valid: true,
      payload,
    });

    const encrypted = await createSecureToken(payload, new TextEncoder().encode("secret"), {
      encrypt: true,
    });
    expect(encrypted.startsWith("sr3.e.")).toBe(true);
    await expect(verifySecureToken<typeof payload>(encrypted, "secret")).resolves.toMatchObject({
      ok: true,
      valid: true,
      payload,
    });
  });

  it("adds expiration, rejects tampering, and distinguishes malformed tokens", async () => {
    const token = await createSecureToken({ value: "ok" }, "secret", {
      expiresInSeconds: 10,
    });
    await expect(verifySecureToken(token, "secret", Date.now() + 9_000)).resolves.toMatchObject({
      ok: true,
    });
    await expect(verifySecureToken(token, "secret", Date.now() + 11_000)).resolves.toMatchObject({
      ok: false,
      error: { code: "EXPIRED" },
    });

    const parts = token.split(".");
    parts[2] = `${parts[2]}x`;
    await expect(verifySecureToken(parts.join("."), "secret")).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_SIGNATURE" },
    });
    await expect(verifySecureToken("sr2.invalid", "secret")).resolves.toMatchObject({
      ok: false,
      error: { code: "MALFORMED" },
    });
  });
});

describe("signed snapshot tokens", () => {
  it("encrypts and verifies snapshots, including expiration checks", async () => {
    const payload = { rallyId: "rally", records: ["spot"] } as const;
    const token = await createSignedSnapshotToken(payload, "snapshot-secret");
    expect(token.startsWith("sr2.")).toBe(true);
    await expect(
      verifySnapshotToken<typeof payload>(token, "snapshot-secret"),
    ).resolves.toMatchObject({
      ok: true,
      valid: true,
      payload,
    });

    const expiring = await createSignedSnapshotToken(
      { expiresAt: "2026-01-02T00:00:00.000Z" },
      "snapshot-secret",
    );
    await expect(
      verifySnapshotToken(expiring, "snapshot-secret", Date.parse("2026-01-03T00:00:00.000Z")),
    ).resolves.toMatchObject({ ok: false, error: { code: "EXPIRED" } });
  });

  it("rejects malformed, wrongly signed, and modified snapshots", async () => {
    const token = await createSignedSnapshotToken({ value: "ok" }, "secret");
    await expect(verifySnapshotToken(token, "wrong-secret")).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_SIGNATURE" },
    });
    const parts = token.split(".");
    parts[1] = `${parts[1]}x`;
    await expect(verifySnapshotToken(parts.join("."), "secret")).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_SIGNATURE" },
    });
    await expect(verifySnapshotToken("sr3.bad", "secret")).resolves.toMatchObject({
      ok: false,
      error: { code: "MALFORMED" },
    });
  });
});
