import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { Auth, BetterAuthOptions } from "better-auth/types";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { oauthProviderResourceClient } from "./client-resource";

it("accepts auth options that omit base URL configuration", () => {
	const options = { plugins: [] } satisfies BetterAuthOptions;
	type AuthWithoutBaseURL = Auth<typeof options>;
	const createResourceClient = oauthProviderResourceClient<AuthWithoutBaseURL>;

	expectTypeOf(createResourceClient)
		.parameter(0)
		.toEqualTypeOf<AuthWithoutBaseURL | undefined>();
});

/**
 * A resource server co-located with the authorization server already holds the
 * issuer's key set in process, but the resource-client options typed `jwksUrl`
 * as a `string` only, so the plugin's own users could not hand over the
 * in-process resolver that introspection and revocation already use.
 *
 * @see https://github.com/better-auth/better-auth/issues/10856
 */
describe("oauth resource client in-process jwks source", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const audience = "https://api.example.com/v1";
	const verifyOptions = { issuer: authServerBaseUrl, audience };
	const { auth, client } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [jwt({ jwt: { issuer: authServerBaseUrl } })],
		},
		{
			// Built without an `auth` argument, so the plugin cannot auto-fill a
			// jwks url. The in-process source has to be supplied explicitly,
			// which is also the shape a separately hosted resource server uses.
			clientOptions: { plugins: [oauthProviderResourceClient()] },
		},
	);

	const { token } = await auth.api.signJWT({
		body: { payload: { sub: "user-123", aud: audience } },
	});

	it("should verify an access token from an in-process jwks source", async () => {
		const read = vi.fn(async () => await auth.api.getJwks());

		await expect(
			client.verifyBearerToken(token, { verifyOptions, jwksUrl: read }),
		).resolves.toMatchObject({ sub: "user-123", aud: audience });
		expect(read).toHaveBeenCalledTimes(1);
	});

	it("should read the in-process jwks source once across verifications sharing a jwksCacheKey", async () => {
		const read = vi.fn(async () => await auth.api.getJwks());
		const jwksCacheKey = {};

		for (let i = 0; i < 3; i++) {
			await expect(
				client.verifyBearerToken(token, {
					verifyOptions,
					jwksUrl: read,
					jwksCacheKey,
				}),
			).resolves.toMatchObject({ sub: "user-123" });
		}
		expect(read).toHaveBeenCalledTimes(1);
	});

	it("should read the in-process jwks source on every verification when no jwksCacheKey is given", async () => {
		const read = vi.fn(async () => await auth.api.getJwks());

		for (let i = 0; i < 3; i++) {
			await expect(
				client.verifyBearerToken(token, { verifyOptions, jwksUrl: read }),
			).resolves.toMatchObject({ sub: "user-123" });
		}
		expect(read).toHaveBeenCalledTimes(3);
	});

	it("should read the in-process jwks source once across protected-resource verifications sharing a jwksCacheKey", async () => {
		const read = vi.fn(async () => await auth.api.getJwks());
		const jwksCacheKey = {};
		const request = {
			authorizationHeader: `Bearer ${token}`,
			method: "GET",
			url: audience,
		};

		// The request entry point resolves `opts` through the same shared type as
		// `verifyBearerToken`, but reaches `verifyAccessTokenPayload` by a different
		// path (authorization scheme parse, then DPoP binding enforcement), so the
		// cache-key hop needs covering on this path too.
		for (let i = 0; i < 3; i++) {
			await expect(
				client.verifyAccessTokenRequest(request, {
					verifyOptions,
					jwksUrl: read,
					jwksCacheKey,
				}),
			).resolves.toMatchObject({ sub: "user-123", aud: audience });
		}
		expect(read).toHaveBeenCalledTimes(1);
	});
});
