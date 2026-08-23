import {
  InMemoryStorage,
  type RallyConfig,
  StampRallyClient,
  type StampRallyState,
  type StampStorage,
} from "@stamprally/core";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStampRally } from "../src/index.js";

const NOW = "2026-08-23T12:00:00.000Z";

const config: RallyConfig = {
  id: "react-hook-test",
  stamps: [
    { id: "first", name: "First", condition: { type: "instant" } },
    { id: "second", name: "Second", condition: { type: "token", token: "OK" } },
  ],
};

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((error: Error) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
    reject: (error) => rejectPromise?.(error),
  };
}

class ControlledStorage implements StampStorage {
  state: StampRallyState | null = null;
  saveGate: Deferred | null = null;
  removeGate: Deferred | null = null;

  async load(): Promise<StampRallyState | null> {
    return this.state;
  }

  async save(state: StampRallyState): Promise<void> {
    if (this.saveGate !== null) await this.saveGate.promise;
    this.state = state;
  }

  async remove(): Promise<void> {
    if (this.removeGate !== null) await this.removeGate.promise;
    this.state = null;
  }
}

afterEach(cleanup);

describe("useStampRally", () => {
  it("initializes only a client whose synchronous snapshot is null", async () => {
    const initializedClient = new StampRallyClient(config, new InMemoryStorage(), () => NOW);
    await initializedClient.init();
    const initializedSpy = vi.spyOn(initializedClient, "init");
    const initializedHook = renderHook(() => useStampRally(initializedClient));

    await waitFor(() => expect(initializedHook.result.current.isLoading).toBe(false));
    expect(initializedSpy).not.toHaveBeenCalled();
    initializedHook.unmount();

    const freshClient = new StampRallyClient(config, new InMemoryStorage(), () => NOW);
    const freshSpy = vi.spyOn(freshClient, "init");
    const freshHook = renderHook(() => useStampRally(freshClient));

    await waitFor(() => expect(freshHook.result.current.isLoading).toBe(false));
    expect(freshSpy).toHaveBeenCalledTimes(1);
  });

  it("restores, subscribes, and switches clients without mirroring store state", async () => {
    const firstStorage = new InMemoryStorage();
    await firstStorage.save({
      rallyId: config.id,
      records: [{ stampId: "first", acquiredAt: NOW }],
      updatedAt: NOW,
    });
    const firstClient = new StampRallyClient(config, firstStorage, () => NOW);
    const secondConfig: RallyConfig = { ...config, id: "second-client" };
    const secondClient = new StampRallyClient(secondConfig, new InMemoryStorage(), () => NOW);
    const { result, rerender } = renderHook(
      ({ client }: { readonly client: StampRallyClient }) => useStampRally(client),
      { initialProps: { client: firstClient } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state).toBe(firstClient.getState());
    expect(result.current.state?.records).toHaveLength(1);

    await act(async () => {
      await firstClient.acquire("second", { type: "token", token: "OK" }, NOW);
    });
    expect(result.current.state).toBe(firstClient.getState());
    expect(result.current.state?.records).toHaveLength(2);

    rerender({ client: secondClient });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state).toBe(secondClient.getState());
    expect(result.current.state?.rallyId).toBe(secondConfig.id);
  });

  it("shows an optimistic record while save is pending and converges on success", async () => {
    const storage = new ControlledStorage();
    const saveGate = createDeferred();
    storage.saveGate = saveGate;
    const client = new StampRallyClient(config, storage, () => NOW);
    const { result } = renderHook(() => useStampRally(client));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let acquisition: ReturnType<typeof result.current.acquire> | undefined;
    act(() => {
      acquisition = result.current.acquire("first", { type: "instant" }, NOW);
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(result.current.state?.records).toEqual([{ stampId: "first", acquiredAt: NOW }]);
    expect(client.getState()?.records).toEqual([]);

    await act(async () => {
      saveGate.resolve();
      const resolved = await acquisition;
      expect(resolved?.ok).toBe(true);
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.state).toBe(client.getState());
    expect(result.current.state?.records).toEqual([{ stampId: "first", acquiredAt: NOW }]);
  });

  it("rolls back engine and storage failures and exposes their errors", async () => {
    const engineClient = new StampRallyClient(config, new InMemoryStorage(), () => NOW);
    const engineHook = renderHook(() => useStampRally(engineClient));
    await waitFor(() => expect(engineHook.result.current.isLoading).toBe(false));

    await act(async () => {
      const mismatch = await engineHook.result.current.acquire(
        "second",
        { type: "token", token: "wrong" },
        NOW,
      );
      expect(mismatch.ok).toBe(false);
    });
    await waitFor(() => expect(engineHook.result.current.isPending).toBe(false));
    expect(engineHook.result.current.state?.records).toEqual([]);
    expect(engineHook.result.current.error).toMatchObject({ code: "CONDITION_MISMATCH" });
    engineHook.unmount();

    const storage = new ControlledStorage();
    const saveGate = createDeferred();
    storage.saveGate = saveGate;
    const storageClient = new StampRallyClient(config, storage, () => NOW);
    const storageHook = renderHook(() => useStampRally(storageClient));
    await waitFor(() => expect(storageHook.result.current.isLoading).toBe(false));
    let acquisition: ReturnType<typeof storageHook.result.current.acquire> | undefined;
    act(() => {
      acquisition = storageHook.result.current.acquire("first", { type: "instant" }, NOW);
    });
    await waitFor(() => expect(storageHook.result.current.isPending).toBe(true));
    expect(storageHook.result.current.state?.records).toHaveLength(1);

    await act(async () => {
      saveGate.reject(new Error("storage failed"));
      await expect(acquisition).rejects.toThrow("storage failed");
    });
    await waitFor(() => expect(storageHook.result.current.isPending).toBe(false));
    expect(storageHook.result.current.state?.records).toEqual([]);
    expect(storageHook.result.current.error).toEqual(new Error("storage failed"));
  });

  it("reports initialization failures and resets through a pending Action", async () => {
    class FailingLoadStorage implements StampStorage {
      async load(): Promise<StampRallyState | null> {
        throw new Error("load failed");
      }

      async save(): Promise<void> {}

      async remove(): Promise<void> {}
    }

    const failingClient = new StampRallyClient(config, new FailingLoadStorage(), () => NOW);
    const failingHook = renderHook(() => useStampRally(failingClient));
    await waitFor(() => expect(failingHook.result.current.isLoading).toBe(false));
    expect(failingHook.result.current.error).toEqual(new Error("load failed"));
    failingHook.unmount();

    const storage = new ControlledStorage();
    storage.state = {
      rallyId: config.id,
      records: [{ stampId: "first", acquiredAt: NOW }],
      updatedAt: NOW,
    };
    const removeGate = createDeferred();
    storage.removeGate = removeGate;
    const client = new StampRallyClient(config, storage, () => NOW);
    const { result } = renderHook(() => useStampRally(client));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let reset: ReturnType<typeof result.current.reset> | undefined;
    act(() => {
      reset = result.current.reset(NOW);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => {
      removeGate.resolve();
      await reset;
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.state?.records).toEqual([]);
    expect(storage.state).toBeNull();
  });
});
