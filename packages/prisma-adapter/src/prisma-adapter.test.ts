import { describe, expect, it, vi } from "vitest";
import { prismaAdapter } from "./prisma-adapter";

describe("prisma-adapter", () => {
	it("should create prisma adapter", () => {
		const prisma = {
			$transaction: vi.fn(),
		} as any;
		const adapter = prismaAdapter(prisma, {
			provider: "sqlite",
		});
		expect(adapter).toBeDefined();
	});
});
