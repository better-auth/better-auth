import type { AuthContext } from "@better-auth/core";
import { createCookieHeaders, createTestCookie } from "./cookie-builder";
import type { LoginResult, TestCookie } from "./types";

export function createLogin(ctx: AuthContext) {
	return async (opts: { userId: string }): Promise<LoginResult> => {
		// Find the user first to avoid creating orphaned sessions
		const user = await ctx.internalAdapter.findUserById(opts.userId);
		if (!user) {
			throw new Error(`User not found: ${opts.userId}`);
		}

		// Create a session for the user
		const session = await ctx.internalAdapter.createSession(opts.userId);

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
	return async (opts: { userId: string }): Promise<Headers> => {
		const session = await ctx.internalAdapter.createSession(opts.userId);
		return createCookieHeaders(ctx, session.token);
	};
}

export function createGetCookies(ctx: AuthContext) {
	return async (opts: {
		userId: string;
		domain?: string;
	}): Promise<TestCookie[]> => {
		const session = await ctx.internalAdapter.createSession(opts.userId);
		return createTestCookie(ctx, session.token, opts.domain);
	};
}
