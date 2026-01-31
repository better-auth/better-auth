import { describe, expect, it, vi } from "vitest";
import { mongodbAdapter } from "./mongodb-adapter";

describe("mongodb-adapter", () => {
	it("should create mongodb adapter", () => {
		const db = {
			collection: vi.fn(),
		} as any;
		const adapter = mongodbAdapter(db);
		expect(adapter).toBeDefined();
	});
});
