import type { AuthContext } from "@better-auth/core";
import type { Session } from "../../types";
import { createCookieHeaders, createTestCookie } from "./cookie-builder";
import type { LoginResult, TestCookie } from "./types";

export function createLogin(ctx: AuthContext) {
	return async (opts: { userId: string }): Promise<LoginResult> => {
		// Create a session for the user
		const session = await ctx.internalAdapter.createSession(opts.userId);

		// Find the user
		const user = await ctx.internalAdapter.findUserById(opts.userId);
		if (!user) {
			throw new Error(`User not found: ${opts.userId}`);
		}

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
		// Check if user already has a session
		const sessions = await ctx.internalAdapter.listSessions(opts.userId);
		let session: Session;

		if (sessions.length > 0) {
			session = sessions[0]!;
		} else {
			// Create a new session
			session = await ctx.internalAdapter.createSession(opts.userId);
		}

		return createCookieHeaders(ctx, session.token);
	};
}

export function createGetCookies(ctx: AuthContext) {
	return async (opts: {
		userId: string;
		domain?: string;
	}): Promise<TestCookie[]> => {
		// Check if user already has a session
		const sessions = await ctx.internalAdapter.listSessions(opts.userId);
		let session: Session;

		if (sessions.length > 0) {
			session = sessions[0]!;
		} else {
			// Create a new session
			session = await ctx.internalAdapter.createSession(opts.userId);
		}

		return createTestCookie(ctx, session.token, opts.domain);
	};
}
