import { describe, expect, expectTypeOf, it } from "vitest";
import type { StateErrorCode } from "../state";
import { getTestInstance } from "../test-utils/test-instance";
import * as oauth2 from ".";
import type { OAuthCallbackErrorCode } from "./errors";
import { OAUTH_CALLBACK_ERROR_CODES } from "./errors";

const knownCodes: ReadonlySet<string> = new Set(
	Object.values(OAUTH_CALLBACK_ERROR_CODES),
);

describe("OAUTH_CALLBACK_ERROR_CODES", async () => {
	const { client } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
			},
		},
	});

	async function callbackErrorCode(query: Record<string, string>) {
		let location = "";
		await client.$fetch("/callback/google", {
			method: "GET",
			query,
			onError(context) {
				location = context.response.headers.get("location") ?? "";
			},
		});
		return new URL(location).searchParams.get("error");
	}

	it("is exported from better-auth/oauth2", () => {
		expect(oauth2.OAUTH_CALLBACK_ERROR_CODES).toBe(OAUTH_CALLBACK_ERROR_CODES);
	});

	it("includes the code for a callback without state", async () => {
		const code = await callbackErrorCode({ code: "test" });
		expect(code).toBe(OAUTH_CALLBACK_ERROR_CODES.STATE_NOT_FOUND);
	});

	it("includes the code for a callback with an unknown state", async () => {
		const code = await callbackErrorCode({ code: "test", state: "unknown" });
		expect(code).not.toBeNull();
		expect(knownCodes).toContain(code);
	});

	it("includes every StateError code parseState redirects with", () => {
		// parseState maps state_security_mismatch to state_mismatch, and
		// state_generation_error is only thrown while starting sign-in.
		expectTypeOf<
			Exclude<
				StateErrorCode,
				"state_security_mismatch" | "state_generation_error"
			>
		>().toExtend<OAuthCallbackErrorCode>();
	});
});
