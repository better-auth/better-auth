import type { BetterAuthOptions } from "@better-auth/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { nextCookies } from "./next-js";

describe("next-js integration", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("auto-enables deferSessionRefresh when it is unset", async () => {
		const { auth } = await getTestInstance({ plugins: [nextCookies()] });
		const ctx = await auth.$context;
		expect(
			(ctx.options as BetterAuthOptions).session?.deferSessionRefresh,
		).toBe(true);
	});

	it("respects an explicit deferSessionRefresh value", async () => {
		const { auth } = await getTestInstance({
			plugins: [nextCookies()],
			session: { deferSessionRefresh: false },
		});
		const ctx = await auth.$context;
		expect(ctx.options.session?.deferSessionRefresh).toBe(false);
	});

	/**
	 * A GET read must not advance the DB session, since RSC renders cannot write
	 * the matching cookie. The refresh is signaled to the client, which re-issues
	 * it as a POST where cookies are writable.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/9776
	 */
	it("defers session refresh on GET instead of writing", async () => {
		const { auth, testUser } = await getTestInstance({
			plugins: [nextCookies()],
			session: { updateAge: 0 },
		});
		const ctx = await auth.$context;
		const updateSession = vi.spyOn(ctx.internalAdapter, "updateSession");

		const signInRes = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			returnHeaders: true,
		});
		const requestHeaders = new Headers();
		requestHeaders.set("cookie", signInRes.headers.getSetCookie()[0]!);

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000);

		const session = (await auth.api.getSession({
			headers: requestHeaders,
		})) as { needsRefresh?: boolean } | null;

		expect(session).not.toBeNull();
		expect(session?.needsRefresh).toBe(true);
		// The GET must signal a refresh without performing the DB write.
		expect(updateSession).not.toHaveBeenCalled();
	});
});
