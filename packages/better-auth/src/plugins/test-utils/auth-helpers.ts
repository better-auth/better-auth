import type { AuthContext } from "@better-auth/core";
import { sessionSchema } from "@better-auth/core/db";
import { createCookieHeaders, createTestCookie } from "./cookie-builder";
import type { LoginResult, TestAuthOptions, TestCookie } from "./types";

async function createSession(ctx: AuthContext, opts: TestAuthOptions) {
	// Find the user first to avoid creating orphaned sessions.
	const user = await ctx.internalAdapter.findUserById(opts.userId);
	if (!user) {
		throw new Error(`User not found: ${opts.userId}`);
	}

	const additionalFields = Object.fromEntries(
		Object.entries(opts.session ?? {}).filter(
			([key]) => !Object.hasOwn(sessionSchema.shape, key),
		),
	);
	// Override additional-field defaults without replacing generated session fields.
	const session = await ctx.internalAdapter.createSession(
		opts.userId,
		false,
		additionalFields,
		true,
	);
	return { session, user };
}

export function createLogin(ctx: AuthContext) {
	return async (opts: TestAuthOptions): Promise<LoginResult> => {
		// Create a session for the user
		const { session, user } = await createSession(ctx, opts);

		// Create cookies array for browser/e2e testing
		const cookies = await createTestCookie(ctx, { session, user });
		const headers = new Headers({
			cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
		});

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
		const { session, user } = await createSession(ctx, opts);
		return createCookieHeaders(ctx, { session, user });
	};
}

export function createGetCookies(ctx: AuthContext) {
	return async (
		opts: TestAuthOptions & { domain?: string },
	): Promise<TestCookie[]> => {
		const { session, user } = await createSession(ctx, opts);
		return createTestCookie(ctx, { session, user }, opts.domain);
	};
}
