import {
  type AdminRallyConfig,
  InMemoryStorage,
  StampRallyClient,
  toPublicConfig,
} from "@stamprally/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStampRally } from "../src/index.js";

const config = toPublicConfig<"en", Record<string, unknown>>({
  id: "r",
  version: "1",
  title: "Rally",
  spots: [
    { id: "s", orderIndex: 0, name: "Spot", conditions: [{ type: "passcode", code: "open" }] },
  ],
  rewards: [],
} satisfies AdminRallyConfig<"en">);
describe("useStampRally", () => {
  it("exposes canonical user switching", async () => {
    const client = new StampRallyClient(config, { storage: new InMemoryStorage() });
    const { result } = renderHook(() => useStampRally(client));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.switchUser("member");
    expect(result.current.state?.userId).toBe("member");
  });

  it("exposes the message from a failed check-in", async () => {
    const client = new StampRallyClient(config, { storage: new InMemoryStorage() });
    const { result } = renderHook(() => useStampRally(client));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.onCheckIn("missing", "proof");
    });
    expect(result.current.error?.message).toBe("Spot was not found.");
  });

  it("stops loading when initialization fails", async () => {
    const client = new StampRallyClient(config, { storage: new InMemoryStorage() });
    vi.spyOn(client, "init").mockRejectedValue(new Error("Storage unavailable"));
    const { result } = renderHook(() => useStampRally(client));
    await waitFor(() => expect(result.current.error?.message).toBe("Storage unavailable"));
    expect(result.current.isLoading).toBe(false);
  });
});
