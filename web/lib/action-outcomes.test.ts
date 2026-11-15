import { beforeEach, expect, it } from "vitest";
import { declineAction, readDeclines, submitAction } from "./submissions";
beforeEach(() => sessionStorage.clear());
it("declines idempotently and prevents later fixture submission", async () => {
  const first = await declineAction("ACT-0001");
  expect(await declineAction("ACT-0001")).toEqual(first);
  expect(readDeclines()).toHaveLength(1);
  await expect(submitAction("ACT-0001", "An edited request")).rejects.toThrow(
    "already declined",
  );
});
it("prevents declining a submitted fixture request", async () => {
  await submitAction("ACT-0001", "An edited request");
  await expect(declineAction("ACT-0001")).rejects.toThrow(
    "submitted for approval",
  );
});
