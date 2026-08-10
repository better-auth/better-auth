import { describe, expect, it } from "vitest";
import {
	CHAT_ERROR_MESSAGE,
	CHAT_RATE_LIMIT_MESSAGE,
	getChatErrorMessage,
} from "./error";

describe("getChatErrorMessage", () => {
	it("returns a recoverable message without exposing internal errors", () => {
		expect(
			getChatErrorMessage(new Error("Gateway request failed: secret")),
		).toBe(CHAT_ERROR_MESSAGE);
	});

	it("explains when the request was rate limited", () => {
		expect(getChatErrorMessage(new Error("Rate limit exceeded"))).toBe(
			CHAT_RATE_LIMIT_MESSAGE,
		);
	});

	it("handles non-Error values", () => {
		expect(getChatErrorMessage(undefined)).toBe(CHAT_ERROR_MESSAGE);
	});
});
