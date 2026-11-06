import type { GenericEndpointContext } from "@better-auth/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateGenericState } from "./state";

function createDatabaseStateContext() {
	const createVerificationValue = vi.fn(async (data: { expiresAt: Date }) => ({
		id: "verification-id",
		...data,
	}));
	const ctx = {
		context: {
			oauthConfig: { storeStateStrategy: "database" },
			secret: "better-auth-secret-123456789012345678901234567890",
			createAuthCookie: (name: string) => ({ name, attributes: {} }),
			internalAdapter: { createVerificationValue },
		},
		setSignedCookie: vi.fn(),
	};
	return {
		ctx: ctx as unknown as GenericEndpointContext,
		createVerificationValue,
	};
}

describe("generateGenericState", () => {
	const originalTZ = process.env.TZ;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		if (originalTZ === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = originalTZ;
		}
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12046
	 */
	it.each([
		// second pass of the repeated 03:00-04:00 hour (fall back)
		["Europe/Helsinki", "2026-10-25T01:30:00.000Z"],
		["America/New_York", "2026-11-01T06:30:00.000Z"],
		// 30-minute DST shift
		["Australia/Lord_Howe", "2026-04-04T15:10:00.000Z"],
		["UTC", "2026-10-25T01:30:00.000Z"],
	])(
		"stores a verification that expires 10 minutes from now in %s at %s",
		async (timeZone, now) => {
			process.env.TZ = timeZone;
			vi.setSystemTime(new Date(now));
			const { ctx, createVerificationValue } = createDatabaseStateContext();

			await generateGenericState(ctx, {
				callbackURL: "/",
				codeVerifier: "code-verifier",
				expiresAt: Date.now() + 10 * 60 * 1000,
			});

			expect(createVerificationValue).toHaveBeenCalledOnce();
			const { expiresAt } = createVerificationValue.mock.calls[0]![0];
			expect(expiresAt.getTime() - Date.now()).toBe(10 * 60 * 1000);
		},
	);
});
