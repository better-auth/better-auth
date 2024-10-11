import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";
import { genericOAuthClient } from "./client";
import { createAuthClient } from "../../client";

import { OAuth2Server } from "oauth2-mock-server";
import { betterFetch } from "@better-fetch/fetch";
import { parseSetCookieHeader } from "../../cookies";

let server = new OAuth2Server();

describe("oauth2", async () => {
	const providerId = "test";
	const clientId = "test-client-id";
	const clientSecret = "test-client-secret";

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");

		server.issuer.on;
		// Start the server
		await server.start(8080, "localhost");
		console.log("Issuer URL:", server.issuer.url); // -> http://localhost:8080
	});

	afterAll(async () => {
		await server.stop();
	});

	const { customFetchImpl } = await getTestInstance({
		plugins: [
			genericOAuth({
				config: [
					{
						providerId,
						discoveryUrl:
							server.issuer.url ||
							"http://localhost:8080/.well-known/openid-configuration",
						clientId: clientId,
						clientSecret: clientSecret,
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

	server.service.once("beforeUserinfo", (userInfoResponse, req) => {
		userInfoResponse.body = {
			email: "oauth2@test.com",
			name: "OAuth2 Test",
			sub: "oauth2",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	async function simulateOAuthFlow(authUrl: string, headers: Headers) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");

		let callbackURL = "";
		const callbackResponse = await betterFetch(location, {
			method: "GET",
			customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
			},
		});

		return callbackURL;
	}

	it("should redirect to the provider and handle the response", async () => {
		let headers = new Headers();
		const res = await authClient.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "http://localhost:3000/dashboard",
			},
			{
				onSuccess(context) {
					const parsedSetCookie = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${
							parsedSetCookie.get("better-auth.state")?.value
						}; better-auth.pk_code_verifier=${
							parsedSetCookie.get("better-auth.pk_code_verifier")?.value
						}`,
					);
				},
			},
		);
		const callbackURL = await simulateOAuthFlow(res.data?.url || "", headers);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("should handle invalid provider ID", async () => {
		const res = await authClient.signIn.oauth2({
			providerId: "invalid-provider",
			callbackURL: "http://localhost:3000/dashboard",
		});
		expect(res.error?.status).toBe(400);
	});

	it("should handle server error during OAuth flow", async () => {
		server.service.once("beforeTokenResponse", (tokenResponse) => {
			tokenResponse.statusCode = 500;
			tokenResponse.body = { error: "internal_server_error" };
		});

		let headers = new Headers();
		const res = await authClient.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "http://localhost:3000/dashboard",
			},
			{
				onSuccess(context) {
					const parsedSetCookie = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${
							parsedSetCookie.get("better-auth.state")?.value
						}; better-auth.pk_code_verifier=${
							parsedSetCookie.get("better-auth.pk_code_verifier")?.value
						}`,
					);
				},
			},
		);

		const callbackURL = await simulateOAuthFlow(res.data?.url || "", headers);
		expect(callbackURL).toContain("?error=");
	});
});
