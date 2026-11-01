import { describe, expect, it } from "vitest";
import { APIError } from "./index";

describe("APIError.from", () => {
	const FAILED = { code: "FAILED", message: "Failed" };

	it("should keep the cause on the error and out of the serialized body", () => {
		const cause = new Error("Connection timeout");
		const options: ErrorOptions = Object.assign(
			{ cause },
			{ detail: "Private detail" },
		);
		const error = APIError.from("INTERNAL_SERVER_ERROR", FAILED, options);

		expect(error.cause).toBe(cause);
		expect(JSON.parse(JSON.stringify(error.body))).toEqual(FAILED);
	});

	it("should not add a cause when none is given", () => {
		const error = APIError.from("BAD_REQUEST", FAILED);

		expect(error.cause).toBeUndefined();
		expect(error.body).toEqual(FAILED);
		expect(error.body && "cause" in error.body).toBe(false);
	});
});
