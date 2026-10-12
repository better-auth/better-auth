import { jwt } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import type { Auth, BetterAuthOptions } from "better-auth/types";
import { expect, expectTypeOf, it, vi } from "vitest";
import { oauthProviderResourceClient } from "./client-resource";
import { oauthProvider } from "./oauth";

it("accepts auth options that omit base URL configuration", () => {
	const options = { plugins: [] } satisfies BetterAuthOptions;
	type AuthWithoutBaseURL = Auth<typeof options>;
	const createResourceClient = oauthProviderResourceClient<AuthWithoutBaseURL>;

	expectTypeOf(createResourceClient)
		.parameter(0)
		.toEqualTypeOf<AuthWithoutBaseURL | undefined>();
});

it.for([
	{ baseURL: "https://auth.example.com/api/auth/", basePath: "/api/auth" },
	{ baseURL: "https://auth.example.com", basePath: "custom/auth/" },
	{ baseURL: "https://auth.example.com", basePath: undefined },
])("verifies a token through the configured JWKS route: $baseURL, $basePath", async ({
	baseURL,
	basePath,
}) => {
	const issuer = "https://auth.example.com";
	const audience = "https://api.example.com";
	const { auth } = await getTestInstance({
		baseURL,
		basePath,
		plugins: [
			jwt({ jwt: { issuer }, jwks: { jwksPath: "/keys/jwks.json" } }),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
	});
	vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
		auth.handler(new Request(input, init)),
	);
	const { token } = await auth.api.signJWT({
		body: { payload: { sub: "test-user", aud: audience } },
	});
	const client = oauthProviderResourceClient(auth).getActions();

	await expect(
		client.verifyBearerToken(token, { verifyOptions: { issuer, audience } }),
	).resolves.toMatchObject({ sub: "test-user" });
});
