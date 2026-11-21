import type { OAuthProvider } from "@better-auth/core/oauth2";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

describe("OAuth callback", () => {
	const providerId = "test-idp";

	function createProvider(protocol?: OAuthProvider["protocol"]) {
		return {
			id: providerId,
			name: "Test IdP",
			protocol,
			accountSubject: () => "test-subject",
			createAuthorizationURL: ({ state }) =>
				new URL(`https://idp.example.com/authorize?state=${state}`),
			validateAuthorizationCode: vi.fn<
				OAuthProvider["validateAuthorizationCode"]
			>(async () => null),
			getUserInfo: async () => null,
		} satisfies OAuthProvider;
	}

	async function startCallback(provider: OAuthProvider) {
		const { auth, client, cookieSetter } = await getTestInstance(
			{
				plugins: [
					{
						id: "test-idp-provider",
						init: (ctx: { socialProviders: OAuthProvider[] }) => ({
							context: { socialProviders: [provider, ...ctx.socialProviders] },
						}),
					},
				],
			},
			{ disableTestUser: true },
		);
		const headers = new Headers();
		const signIn = await client.signIn.social({
			provider: providerId,
			callbackURL: "/dashboard",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});
		const state = new URL(signIn.data!.url!).searchParams.get("state")!;
		const callbackURL = `http://localhost:3000/api/auth/callback/${providerId}`;
		return {
			callbackURL,
			state,
			complete: async (query: URLSearchParams, id = providerId) =>
				(
					await auth.handler(
						new Request(`${callbackURL.replace(providerId, id)}?${query}`, {
							headers,
						}),
					)
				).headers.get("location"),
		};
	}

	describe.each([
		["no protocol", undefined],
		["protocol oauth2", "oauth2"],
	] as const)("a provider with %s", (_, protocol) => {
		it("exchanges the code with the arguments it always received", async () => {
			const provider = createProvider(protocol);
			const { callbackURL, state, complete } = await startCallback(provider);

			const location = await complete(
				new URLSearchParams({ code: "authorization-code", state }),
			);

			expect(location).toContain("error=invalid_code");
			expect(provider.validateAuthorizationCode).toHaveBeenCalledTimes(1);
			const [args] = provider.validateAuthorizationCode.mock.calls[0]!;
			expect(Object.keys(args).sort()).toEqual([
				"code",
				"codeVerifier",
				"deviceId",
				"redirectURI",
			]);
			expect(args).toMatchObject({
				code: "authorization-code",
				redirectURI: callbackURL,
			});
		});

		it("reports a missing code without calling the provider", async () => {
			const provider = createProvider(protocol);
			const { state, complete } = await startCallback(provider);

			const location = await complete(new URLSearchParams({ state }));

			expect(location).toContain("error=no_code");
			expect(provider.validateAuthorizationCode).not.toHaveBeenCalled();
		});
	});

	it("reports a missing code before an unknown provider", async () => {
		const { state, complete } = await startCallback(createProvider());

		const location = await complete(new URLSearchParams({ state }), "unknown");

		expect(location).toContain("error=no_code");
	});

	it("reports an unknown provider when the code is present", async () => {
		const { state, complete } = await startCallback(createProvider());

		const location = await complete(
			new URLSearchParams({ state, code: "authorization-code" }),
			"unknown",
		);

		expect(location).toContain("error=oauth_provider_not_found");
	});

	it("passes the callback request to an OpenID 2.0 provider that has no code", async () => {
		const provider = createProvider("openid2");
		const { callbackURL, state, complete } = await startCallback(provider);

		await complete(new URLSearchParams({ state, "openid.mode": "id_res" }));

		expect(provider.validateAuthorizationCode).toHaveBeenCalledTimes(1);
		const [args] = provider.validateAuthorizationCode.mock.calls[0]!;
		expect(args.code).toBe("");
		expect(args.request?.url).toBe(
			`${callbackURL}?state=${state}&openid.mode=id_res`,
		);
	});
});
