import { verifyBearerToken } from "better-auth/oauth2";
import type { Auth, BetterAuthOptions } from "better-auth/types";
import { expect, expectTypeOf, it, vi } from "vitest";
import { oauthProviderResourceClient } from "./client-resource";

vi.mock("better-auth/oauth2", async (importOriginal) => {
	const original = await importOriginal<typeof import("better-auth/oauth2")>();
	return {
		...original,
		verifyBearerToken: vi.fn(async () => ({ sub: "test-user" })),
	};
});

it("accepts auth options that omit base URL configuration", () => {
	const options = { plugins: [] } satisfies BetterAuthOptions;
	type AuthWithoutBaseURL = Auth<typeof options>;
	const createResourceClient = oauthProviderResourceClient<AuthWithoutBaseURL>;

	expectTypeOf(createResourceClient)
		.parameter(0)
		.toEqualTypeOf<AuthWithoutBaseURL | undefined>();
});

it.each([
	{
		baseURL: "https://auth.example.com/api/auth/",
		basePath: "/api/auth",
		expectedJWKSURL: "https://auth.example.com/api/auth/keys/jwks.json",
	},
	{
		baseURL: "https://auth.example.com",
		basePath: "custom/auth/",
		expectedJWKSURL: "https://auth.example.com/custom/auth/keys/jwks.json",
	},
])("resolves the JWKS URL from $baseURL and $basePath", async ({
	baseURL,
	basePath,
	expectedJWKSURL,
}) => {
	const auth = {
		options: {
			baseURL,
			basePath,
		},
		$context: Promise.resolve({
			getPlugin(id: string) {
				if (id === "jwt") {
					return { options: { jwks: { jwksPath: "/keys/jwks.json" } } };
				}
				return { options: { disableJwtPlugin: false } };
			},
		}),
	} as unknown as Parameters<typeof oauthProviderResourceClient>[0];
	const resourceClient = oauthProviderResourceClient(auth);

	await resourceClient.getActions().verifyBearerToken("access-token");

	expect(verifyBearerToken).toHaveBeenCalledWith(
		"access-token",
		expect.objectContaining({
			jwksUrl: expectedJWKSURL,
		}),
	);
});
