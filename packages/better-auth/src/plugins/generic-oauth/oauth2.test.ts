import { describe, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";
import { genericOAuthClient } from "./client";
import { createAuthClient } from "../../client";

describe("oauth2", async () => {
	const { auth, customFetchImpl } = await getTestInstance({
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: "test",
						clientId: "test",
						clientSecret: "test",
						discoveryUrl: "https://test.com/.well-known/oauth-authorization",
						scopes: ["test"],
					},
				],
			}),
		],
	});

	const authClient = createAuthClient({
		plugins: [genericOAuthClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	it("should redirect to the provider", async () => {
		const res = await authClient.signIn.oauth2({
			providerId: "test",
		});

		console.log(res);
	});
});
