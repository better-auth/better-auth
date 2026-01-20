import { createAdapterFactory } from "@better-auth/core/db/adapter";
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { drizzleAdapter } from "../drizzle-adapter";

// Mock the createAdapterFactory to capture the config
vi.mock("@better-auth/core/db/adapter", async () => {
	const actual = await vi.importActual("@better-auth/core/db/adapter");
	return {
		...actual,
		createAdapterFactory: vi.fn((options) => {
			// return a dummy adapter function
			return () => ({
				create: async () => {},
				findOne: async () => {},
				// ... add other methods if needed
			});
		}),
	};
});

/**
 * Test for GitHub Issue #7419
 * Support `{ mode: "string" }` for timestamps in Drizzle adapter
 */

// Mock Drizzle schema column with { mode: "string" }
const mockDrizzleSchemaWithStringMode = {
	user: {
		id: { dataType: "string" },
		name: { dataType: "string" },
		createdAt: { dataType: "string" },
		updatedAt: { dataType: "string" },
	},
};

// Mock Drizzle schema column with { mode: "date" } (default)
const mockDrizzleSchemaWithDateMode = {
	user: {
		id: { dataType: "string" },
		name: { dataType: "string" },
		createdAt: { dataType: "date" },
		updatedAt: { dataType: "date" },
	},
};

describe("drizzle adapter - timestamp mode string support (unit test)", () => {
	it("should register customTransformInput hook that converts Date to ISO string for { mode: 'string' } columns", async () => {
		// 1. Initialize the adapter
		const _adapter = drizzleAdapter({} as any, {
			schema: mockDrizzleSchemaWithStringMode as any,
			provider: "pg",
		});

		// 2. Verify createAdapterFactory was called
		expect(createAdapterFactory).toHaveBeenCalled();

		// 3. Extract the config passed to createAdapterFactory
		const callArgs = (createAdapterFactory as Mock).mock.calls[0][0];
		const config = callArgs.config;

		expect(config).toBeDefined();
		expect(config.customTransformInput).toBeDefined();
		expect(typeof config.customTransformInput).toBe("function");

		// 4. Test the hook implementation directly
		const customTransformInput = config.customTransformInput;
		const testDate = new Date("2026-01-17T12:00:00.000Z");

		// Case A: Should convert Date to string when dataType is "string"
		const resultString = customTransformInput({
			data: testDate,
			field: "createdAt",
			model: "user",
		});
		expect(resultString).toBe(testDate.toISOString());

		// Case B: Should NOT convert non-Date values
		const resultName = customTransformInput({
			data: "John Doe",
			field: "name",
			model: "user",
		});
		expect(resultName).toBe("John Doe");
	});

	it("should NOT convert Date to string when dataType is 'date' (default)", async () => {
		// Reset mocks
		vi.clearAllMocks();

		// Initialize adapter with Date mode schema
		drizzleAdapter({} as any, {
			schema: mockDrizzleSchemaWithDateMode as any,
			provider: "pg",
		});

		const callArgs = (createAdapterFactory as Mock).mock.calls[0][0];
		const config = callArgs.config;
		const customTransformInput = config.customTransformInput;
		const testDate = new Date("2026-01-17T12:00:00.000Z");

		// Case: Should return Date object (no conversion)
		const result = customTransformInput({
			data: testDate,
			field: "createdAt",
			model: "user",
		});
		expect(result).toBeInstanceOf(Date);
		expect(result).toBe(testDate);
	});
});
