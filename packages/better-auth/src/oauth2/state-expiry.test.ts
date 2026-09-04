import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../cookies";
import { getTestInstance } from "../test-utils/test-instance";

/**
 * @see https://github.com/better-auth/better-auth/issues/11012
 *
 * The signed state cookie proves ownership of the verification row it is
 * checked against, so it must live at least as long as that row. Both derive
 * from a single `account.stateExpiresIn` window.
 */
describe("oauth state expiry", () => {
	async function startSignIn(options?: { stateExpiresIn?: number }) {
		const { client, auth } = await getTestInstance({
			account: options,
			socialProviders: {
				google: { clientId: "test", clientSecret: "test" },
			},
		});
		let maxAge: number | undefined;
		const res = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess(context) {
					maxAge = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					).get("better-auth.state")?.["max-age"];
				},
			},
		});
		const state = new URL(res.data!.url!).searchParams.get("state")!;
		// Measured after the response so it can only be shorter than the cookie's
		// remaining lifetime, never longer.
		const now = Date.now();
		const row = await auth.$context.then((c) =>
			c.internalAdapter.findVerificationValue(state),
		);
		return { maxAge: maxAge!, rowTTL: row!.expiresAt.getTime() - now };
	}

	it("keeps the state cookie alive at least as long as the verification row", async () => {
		const { maxAge, rowTTL } = await startSignIn();
		expect(rowTTL).toBeGreaterThan(9 * 60 * 1000);
		expect(maxAge * 1000).toBeGreaterThanOrEqual(rowTTL);
	});

	it("honors account.stateExpiresIn for the cookie and the row", async () => {
		const { maxAge, rowTTL } = await startSignIn({ stateExpiresIn: 30 * 60 });
		expect(rowTTL).toBeGreaterThan(29 * 60 * 1000);
		expect(maxAge * 1000).toBeGreaterThanOrEqual(rowTTL);
	});
});
