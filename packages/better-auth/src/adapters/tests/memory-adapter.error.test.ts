import { describe, it, expect } from "vitest";
import { memoryAdapter } from "../memory-adapter/memory-adapter";

describe("memoryAdapter – typed errors", () => {
  it("throws MODEL_NOT_FOUND when model does not exist", async () => {
    const db = {};
    const adapterFactory = memoryAdapter(db as any);
    const adapter = adapterFactory({} as any);
    await expect(
      adapter.findOne({
        model: "users",
        where: [],
      }),
    ).rejects.toThrowError(/Model.*not found/i);
  });
});
