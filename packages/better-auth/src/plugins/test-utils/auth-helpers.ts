import type { AuthContext } from "@better-auth/core";
import { sessionSchema } from "@better-auth/core/db";
import { createCookieHeaders, createTestCookie } from "./cookie-builder";
import type { LoginResult, TestAuthOptions, TestCookie } from "./types";

async function getUser(ctx: AuthContext, userId: string) {
	const user = await ctx.internalAdapter.findUserById(userId);
	if (!user) {
		throw new Error(`User not found: ${userId}`);
	}
	return user;
}

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
		// Find the user first to avoid creating orphaned sessions.
		const user = await getUser(ctx, opts.userId);
		const session = await createSession(ctx, opts);

		// Create cookies array for browser/e2e testing
		const cookies = await createTestCookie(ctx, { session, user });
		const headers = createCookieHeaders(cookies);

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
		const user = await getUser(ctx, opts.userId);
		const session = await createSession(ctx, opts);
		const cookies = await createTestCookie(ctx, { session, user });
		return createCookieHeaders(cookies);
	};
}

export function createGetCookies(ctx: AuthContext) {
	return async (
		opts: TestAuthOptions & { domain?: string },
	): Promise<TestCookie[]> => {
		const user = await getUser(ctx, opts.userId);
		const session = await createSession(ctx, opts);
		return createTestCookie(ctx, { session, user }, opts.domain);
	};
}
