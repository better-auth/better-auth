import type { AuthContext } from "@better-auth/core";
import { sessionSchema } from "@better-auth/core/db";
import { createCookieHeaders, createTestCookie } from "./cookie-builder";
import type { LoginResult, TestAuthOptions, TestCookie } from "./types";

function createSession(ctx: AuthContext, opts: TestAuthOptions) {
	const additionalFields = Object.fromEntries(
		Object.entries(opts.session ?? {}).filter(
			([key]) => !Object.hasOwn(sessionSchema.shape, key),
		),
	);
	// Override additional-field defaults without replacing generated session fields.
	return ctx.internalAdapter.createSession(
		opts.userId,
		false,
		additionalFields,
		true,
	);
}

export function createLogin(ctx: AuthContext) {
	return async (opts: TestAuthOptions): Promise<LoginResult> => {
		// Find the user first to avoid creating orphaned sessions
		const user = await ctx.internalAdapter.findUserById(opts.userId);
		if (!user) {
			throw new Error(`User not found: ${opts.userId}`);
		}

		// Create a session for the user
		const session = await createSession(ctx, opts);

		// Create headers with cookie
		const headers = await createCookieHeaders(ctx, session.token);

		// Create cookies array for browser/e2e testing
		const cookies = await createTestCookie(ctx, session.token);

		return {
			session,
			user,
			headers,
			cookies,
			token: session.token,
		};
	};
}

export function createGetAuthHeaders(ctx: AuthContext) {
	return async (opts: TestAuthOptions): Promise<Headers> => {
		const session = await createSession(ctx, opts);
		return createCookieHeaders(ctx, session.token);
	};
}

export function createGetCookies(ctx: AuthContext) {
	return async (
		opts: TestAuthOptions & { domain?: string },
	): Promise<TestCookie[]> => {
		const session = await createSession(ctx, opts);
		return createTestCookie(ctx, session.token, opts.domain);
	};
}
