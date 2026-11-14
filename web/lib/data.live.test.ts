import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("loads an empty live workspace without requesting exposure for a missing change", async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_FIXTURES", "false");
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", request);
  const { loadWorkspace } = await import("./data");
  await expect(loadWorkspace()).resolves.toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toMatch(/\/changes$/);
});
