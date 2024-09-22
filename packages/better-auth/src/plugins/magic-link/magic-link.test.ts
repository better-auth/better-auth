import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { magicLink } from ".";
import { createAuthClient } from "../../client";
import { magicLinkClient } from "./client";

describe("magic link", async () => {
	let verificationEmail = {
		email: "",
		url: "",
	};
	const { auth, customFetchImpl, testUser, sessionSetter } =
		await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink(email, url) {
						verificationEmail = { email, url };
					},
				}),
			],
		});

	const client = createAuthClient({
		plugins: [magicLinkClient()],
		fetchOptions: {
			customFetchImpl,
		},
		baseURL: "http://localhost:3000/api/auth",
	});

	it("should send magic link", async () => {
		await client.signIn.magicLink({
			email: testUser.email,
		});
		expect(verificationEmail).toMatchObject({
			email: testUser.email,
			url: expect.stringContaining(
				"http://localhost:3000/api/auth/magic-link/verify",
			),
		});
	});
	it("should verify magic link", async () => {
		const headers = new Headers();
		const response = await client.magicLink.verify({
			query: {
				token: new URL(verificationEmail.url).searchParams.get("token") || "",
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		expect(response.data).toMatchObject({
			status: true,
		});
		const betterAuthCookie = headers.get("set-cookie");
		expect(betterAuthCookie).toBeDefined();
	});
});
