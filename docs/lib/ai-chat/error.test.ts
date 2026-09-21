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
		const errors = [
			"Rate limit exceeded",
			"rate_limit_error",
			"Too Many Requests",
			"RESOURCE_EXCEEDED",
			"RESOURCE_EXHAUSTED",
			"Quota exceeded",
			"quota_exhausted",
			"Request failed with status 429",
			"HTTP 429",
		];

		for (const error of errors) {
			expect(getChatErrorMessage(new Error(error))).toBe(
				CHAT_RATE_LIMIT_MESSAGE,
			);
		}
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10760
	 */
	it("does not mistake unrelated quota or numeric details for rate limits", () => {
		const errors = [
			"Moderation blocked due to output quota policy",
			"Gateway metadata: not a rate limit error",
			"Unexpected value 429 in response",
		];

		for (const error of errors) {
			expect(getChatErrorMessage(new Error(error))).toBe(CHAT_ERROR_MESSAGE);
		}
	});

	it("preserves sanitized errors received from the stream", () => {
		expect(getChatErrorMessage(new Error(CHAT_ERROR_MESSAGE))).toBe(
			CHAT_ERROR_MESSAGE,
		);
		expect(getChatErrorMessage(new Error(CHAT_RATE_LIMIT_MESSAGE))).toBe(
			CHAT_RATE_LIMIT_MESSAGE,
		);
	});

	it("handles non-Error values", () => {
		expect(getChatErrorMessage(undefined)).toBe(CHAT_ERROR_MESSAGE);
	});
});
