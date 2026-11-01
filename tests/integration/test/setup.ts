import { afterEach, beforeEach, vi } from "vitest";

const EXPECTED_CAPABILITY_WARNINGS = new Set([
  "[@stamprally/core] Offline queue persistence is unavailable; queued data is memory-only.",
  "[@stamprally/core] Web Locks is unavailable; automatic cross-tab synchronization is disabled. Sync must be triggered by the foreground tab.",
]);

// These tests use in-memory queues without Web Locks; keep all other warnings visible.
beforeEach(() => {
  const warn = console.warn.bind(console);
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === "string" && EXPECTED_CAPABILITY_WARNINGS.has(args[0])) return;
    warn(...args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
