import { describe, it, expect } from "vitest";
import { memoryAdapter } from "../memory-adapter/memory-adapter";

describe("memoryAdapter – typed errors", () => {
  it("throws MODEL_NOT_FOUND when model does not exist", async () => {
    const db = {};
    const adapterFactory = memoryAdapter(db);

    
    const adapter = adapterFactory({
      baseUrl: "http://localhost",
      secret: "test",
    } as any);

    try {
      await adapter.findMany({
        model: "users",
        where: [],
      });
      throw new Error("Expected error was not thrown");
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain("Model");
      expect(error.message).toContain("not found");
    }
  });
});
