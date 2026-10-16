import { describe, expect, it } from "vitest";
import { APIError } from "./index";

describe("APIError", () => {
	it("should retain non-enumerable cause when created via from()", () => {
		const originalCause = new Error("Database query failed");
		const err = APIError.from(
			"INTERNAL_SERVER_ERROR",
			{ code: "FAILED_TO_GET_SESSION", message: "Failed to get session" },
			{ cause: originalCause },
		);

		expect(err.cause).toBe(originalCause);
		expect(Object.keys(err)).not.toContain("cause");
		expect(JSON.parse(JSON.stringify(err))).not.toHaveProperty("cause");
	});

	it("should create APIError without cause when options.cause is omitted", () => {
		const err = APIError.from(
			"BAD_REQUEST",
			{ code: "INVALID_INPUT", message: "Invalid input" },
		);

		expect(err.cause).toBeUndefined();
	});
});
