import { describe, expect, it } from "vitest";
import {
  createGoogleAuthContext,
  InMemoryServerPersistenceAdapter,
  StampRallyServer,
} from "../src/index.js";

const config = {
  id: "rally",
  version: "1",
  title: "Rally",
  spots: [{ id: "spot", orderIndex: 0, name: "Spot", conditions: [] }],
  rewards: [],
} as const;

function encoded(value: unknown): string {
  return globalThis
    .btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

describe("createGoogleAuthContext", () => {
  it("verifies an injected Google-style JWKS and authenticates direct server calls", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const header = encoded({ alg: "RS256", kid: "test-key" });
    const payload = encoded({
      iss: "https://accounts.google.com",
      aud: "client-id",
      sub: "google-sub-1",
      email: "member@example.test",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    const encodedSignature = globalThis
      .btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    const context = await createGoogleAuthContext(`${header}.${payload}.${encodedSignature}`, {
      clientId: "client-id",
      fetch: async () =>
        new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: "test-key" }] })),
    });
    expect(context).toMatchObject({ authenticatedUserId: "google-sub-1", isAnonymous: false });
    expect(context.claims?.email).toBe("member@example.test");

    const server = new StampRallyServer(config, new InMemoryServerPersistenceAdapter());
    const result = await server.checkIn(
      {
        rallyId: "rally",
        userId: "attacker",
        spotId: "spot",
        context: { type: "passcode", code: "unused" },
        idempotencyKey: "google-direct-call",
      },
      context,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.state.userId).toBe("google-sub-1");
  });

  it("rejects a token with the wrong audience", async () => {
    await expect(
      createGoogleAuthContext("not-a-jwt", { clientId: "client-id" }),
    ).rejects.toMatchObject({ code: "MALFORMED_TOKEN" });
  });
});
