import {
  type AdminRallyConfig,
  InMemoryStorage,
  StampRallyClient,
  toPublicConfig,
} from "@stamprally/core";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
