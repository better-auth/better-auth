import { describe, expect, it } from "vitest";
import { getAuthStateVerificationIdentifier } from "../../state";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";

describe("generic-oauth provider error callback", () => {
	/**
	 * A provider-side failure (consent denied, `?error=access_denied`) arrives on
	 * the OAuth callback while a valid `state` is in hand. The redirect must honor
	 * the `errorCallbackURL` that was persisted with that state, not fall back to
	 * Better Auth's generic error page, and the state must be consumed.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/11564
	 */
	it("redirects a provider error to the flow's errorCallbackURL and consumes the state", async () => {
		const providerId = "connection-x";
		const errorCallbackURL = "/settings?failed";

		const { auth, client, customFetchImpl, cookieSetter, signInWithTestUser } =
			await getTestInstance({
				plugins: [
					genericOAuth({
						config: [
							{
								providerId,
								clientId: "test-client-id",
								clientSecret: "test-client-secret",
								authorizationUrl: "https://idp.example.com/authorize",
								tokenUrl: "https://idp.example.com/token",
								userInfoUrl: "https://idp.example.com/userinfo",
							},
						],
					}),
				],
			});

		const { headers } = await signInWithTestUser();

		const linkRes = await client.linkSocial(
			{
				provider: providerId,
				callbackURL: "/settings?linked",
				errorCallbackURL,
			},
			{ headers, onSuccess: cookieSetter(headers) },
		);
		if (!linkRes.data?.url) {
			throw new Error(
				`linkSocial did not return an authorization URL: ${JSON.stringify(linkRes)}`,
			);
		}
		const state = new URL(linkRes.data.url).searchParams.get("state") ?? "";
		expect(state).not.toBe("");

		const ctx = await auth.$context;
		const storedBefore = await ctx.adapter.findMany<{ identifier: string }>({
			model: "verification",
		});
		expect(
			storedBefore.filter(
				(record) =>
					record.identifier === getAuthStateVerificationIdentifier(state),
			),
		).toHaveLength(1);

		// The user denies consent at the provider, which bounces back with
		// `error=access_denied` and the state we just minted.
		const res = await customFetchImpl(
			`http://localhost:3000/api/auth/callback/${providerId}?error=access_denied&state=${state}`,
			{ method: "GET", headers, redirect: "manual" },
		);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(
			`${errorCallbackURL}&error=access_denied`,
		);

		const storedAfter = await ctx.adapter.findMany<{ identifier: string }>({
			model: "verification",
		});
		expect(
			storedAfter.filter(
				(record) =>
					record.identifier === getAuthStateVerificationIdentifier(state),
			),
		).toHaveLength(0);
	});

	/**
	 * Without an `errorCallbackURL` on the flow there is no per-flow target
	 * to honor, so a provider error must fall back to Better Auth's default
	 * error page — and the state must still be consumed.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/11564
	 */
	it("falls back to the default error page when the flow has no errorCallbackURL", async () => {
		const providerId = "connection-x";

		const { auth, client, customFetchImpl, cookieSetter, signInWithTestUser } =
			await getTestInstance({
				plugins: [
					genericOAuth({
						config: [
							{
								providerId,
								clientId: "test-client-id",
								clientSecret: "test-client-secret",
								authorizationUrl: "https://idp.example.com/authorize",
								tokenUrl: "https://idp.example.com/token",
								userInfoUrl: "https://idp.example.com/userinfo",
							},
						],
					}),
				],
			});

		const { headers } = await signInWithTestUser();

		const linkRes = await client.linkSocial(
			{
				provider: providerId,
				callbackURL: "/settings?linked",
			},
			{ headers, onSuccess: cookieSetter(headers) },
		);
		if (!linkRes.data?.url) {
			throw new Error(
				`linkSocial did not return an authorization URL: ${JSON.stringify(linkRes)}`,
			);
		}
		const state = new URL(linkRes.data.url).searchParams.get("state") ?? "";
		expect(state).not.toBe("");

		const res = await customFetchImpl(
			`http://localhost:3000/api/auth/callback/${providerId}?error=access_denied&state=${state}`,
			{ method: "GET", headers, redirect: "manual" },
		);

		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("/api/auth/error");
		expect(location).toContain("error=access_denied");

		const ctx = await auth.$context;
		const storedAfter = await ctx.adapter.findMany<{ identifier: string }>({
			model: "verification",
		});
		expect(
			storedAfter.filter(
				(record) =>
					record.identifier === getAuthStateVerificationIdentifier(state),
			),
		).toHaveLength(0);
	});
});
