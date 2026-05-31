/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-86j7-9j95-vpqj
 */
import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidcProvider } from ".";
import { oidcClient } from "./client";

async function getClient() {
	const { customFetchImpl, signInWithTestUser } = await getTestInstance({
		baseURL: "http://localhost:3000",
		plugins: [
			oidcProvider({
				loginPage: "/login",
				consentPage: "/consent",
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	return createAuthClient({
		plugins: [oidcClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: { customFetchImpl, headers },
	});
}

describe("oidc-provider redirect_uri scheme validation", () => {
	it("rejects javascript:, data:, and vbscript: redirect URIs at registration", async () => {
		const client = await getClient();
		for (const uri of [
			"javascript:fetch('/api/auth/get-session')//",
			"data:text/html,<script>alert(1)</script>",
			"vbscript:msgbox(1)",
		]) {
			const reg = await client.oauth2.register({
				client_name: "Evil App",
				redirect_uris: [uri],
			});
			expect(reg.error?.status).toBe(400);
			expect(reg.data?.client_id).toBeUndefined();
		}
	});

	it("still accepts https and loopback http redirect URIs", async () => {
		const client = await getClient();
		const reg = await client.oauth2.register({
			client_name: "Good App",
			redirect_uris: [
				"https://client.example.com/callback",
				"http://localhost:3000/callback",
			],
		});
		expect(reg.error).toBeNull();
		expect(reg.data?.client_id).toBeDefined();
	});
});
