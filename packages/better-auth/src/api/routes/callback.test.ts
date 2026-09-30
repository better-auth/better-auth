import type { OAuthProvider } from "@better-auth/core/oauth2";
import { getOAuth2Tokens } from "@better-auth/core/oauth2";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("callback", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/1259
	 */
	it("logs the provider error when a 200 token response has no access_token or id_token", async () => {
		const provider = {
			id: "no-token-provider",
			name: "No Token Provider",
			accountSubject: () => "subject",
			createAuthorizationURL: ({ state }) =>
				new URL(`https://idp.example.com/authorize?state=${state}`),
			validateAuthorizationCode: async () =>
				// Mirrors a provider (e.g. Slack) that answers with HTTP 200 but an
				// error in the response body instead of failing the HTTP request.
				getOAuth2Tokens({ ok: false, error: "invalid_code" }),
			getUserInfo: async () => null,
		} satisfies OAuthProvider<Record<string, never>>;

		const { client, auth, cookieSetter } = await getTestInstance({
			plugins: [
				{
					id: "no-token-provider-plugin",
					init: (ctx) => ({
						context: {
							socialProviders: [provider, ...ctx.socialProviders],
						},
					}),
				},
			],
		});

		const ctx = await auth.$context;
		const errorSpy = vi.spyOn(ctx.logger, "error").mockImplementation(() => {});

		const oAuthHeaders = new Headers();
		const signIn = await client.signIn.social(
			{
				provider: provider.id,
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oAuthHeaders),
			},
		);
		const state = new URL(signIn.url!).searchParams.get("state");

		await client.$fetch(`/callback/${provider.id}?code=test&state=${state}`, {
			method: "GET",
			headers: oAuthHeaders,
			onError() {},
		});

		const noTokenCalls = errorSpy.mock.calls.filter(
			([message]) =>
				message ===
				"OAuth token response contained no access_token or id_token",
		);
		expect(noTokenCalls).toHaveLength(1);
		expect(noTokenCalls[0]?.[1]).toEqual({
			providerId: provider.id,
			error: "invalid_code",
			error_description: undefined,
			ok: false,
		});
		// The raw token response must never be logged as-is.
		expect(JSON.stringify(noTokenCalls[0])).not.toContain('"raw"');

		errorSpy.mockRestore();
	});
});
