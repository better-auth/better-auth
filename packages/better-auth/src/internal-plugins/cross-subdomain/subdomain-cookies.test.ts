import { describe, expect, it, vi } from "vitest";
import { crossSubdomainCookies } from "./index";
import { getTestInstance } from "../../test-utils/test-instance";

describe("crossSubdomainCookies", async () => {
	const { client, testUser } = await getTestInstance({
		plugins: [
			crossSubdomainCookies({
				domainName: "example.com",
			}),
		],
		socialProviders: {
			google: {
				clientId: "google",
				clientSecret: "google",
			},
		},
	});

	it("should update cookies with custom domain", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					console.log(setCookie);
					expect(setCookie).toContain("Domain=example.com");
				},
			},
		);
	});

	it("should not modify cookies if none are eligible", async () => {
		await client.signIn.social(
			{
				provider: "google",
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).not.toContain("Domain=example.com");
				},
			},
		);
	});
});
