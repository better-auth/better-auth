import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, SchemaClient } from "./types";

const baseURL = "http://localhost:3000";
const scopes = ["read:posts"];

async function createInstance(
	clientRegistrationClientSecretExpiration?: OAuthOptions["clientRegistrationClientSecretExpiration"],
) {
	const instance = await getTestInstance({
		baseURL,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				scopes,
				clientPrivileges: () => true,
				clientRegistrationClientSecretExpiration,
			}),
		],
	});
	const { headers } = await instance.signInWithTestUser();
	const requestToken = (clientId: string, clientSecret: string) =>
		instance.auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
				},
				body: new URLSearchParams({ grant_type: "client_credentials" }),
			}),
		);
	const createClient = (
		client_secret_expires_at?: number | string,
	): ReturnType<typeof instance.auth.api.adminCreateOAuthClient> =>
		instance.auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["client_credentials"],
				client_credentials_scopes: scopes,
				client_secret_expires_at,
			},
		});
	return { ...instance, headers, requestToken, createClient };
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc7591#section-3.2.1
 */
describe("oauth client secret expiry", async () => {
	const { auth, headers, requestToken, createClient } =
		await createInstance("30d");

	it("persists and reports the expiry set by clientRegistrationClientSecretExpiration", async () => {
		const registered = await auth.api.registerOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://rp.example.com/callback"],
				token_endpoint_auth_method: "client_secret_basic",
			},
		});
		const expiresAt = registered.client_id_issued_at! + 30 * 24 * 60 * 60;
		expect(registered.client_secret_expires_at).toBe(expiresAt);

		const ctx = await auth.$context;
		const stored = await ctx.adapter.findOne<SchemaClient>({
			model: "oauthClient",
			where: [{ field: "clientId", value: registered.client_id }],
		});
		expect(stored?.expiresAt).toEqual(new Date(expiresAt * 1000));

		const read = await auth.api.getOAuthClient({
			headers,
			query: { client_id: registered.client_id },
		});
		expect(read.client_secret_expires_at).toBe(expiresAt);
	});

	it("persists an admin-set expiry and authenticates the secret until then", async () => {
		const expiresAt = Math.floor(Date.now() / 1000) + 3600;
		const client = await createClient(expiresAt);
		expect(client.client_secret_expires_at).toBe(expiresAt);

		const response = await requestToken(
			client.client_id,
			client.client_secret!,
		);
		expect(response.status).toBe(200);
	});

	it("rejects an expired secret with invalid_client", async () => {
		const expiresAt = Math.floor(Date.now() / 1000) - 3600;
		const client = await createClient(expiresAt);
		expect(client.client_secret_expires_at).toBe(expiresAt);

		const response = await requestToken(
			client.client_id,
			client.client_secret!,
		);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: "invalid_client" });
	});

	it("lets an admin clear an expiry with client_secret_expires_at 0", async () => {
		const client = await createClient(Math.floor(Date.now() / 1000) - 3600);

		const updated = await auth.api.adminUpdateOAuthClient({
			headers,
			body: {
				client_id: client.client_id,
				update: { client_secret_expires_at: 0 },
			},
		});
		expect(updated.client_secret_expires_at).toBe(0);

		const response = await requestToken(
			client.client_id,
			client.client_secret!,
		);
		expect(response.status).toBe(200);
	});

	it("reads a string client_secret_expires_at as a time span", async () => {
		const before = Math.floor(Date.now() / 1000);
		const client = await createClient("1h");
		expect(client.client_secret_expires_at).toBeGreaterThanOrEqual(
			before + 3600,
		);
		expect(client.client_secret_expires_at).toBeLessThanOrEqual(
			Math.floor(Date.now() / 1000) + 3600,
		);

		for (const invalid of ["soon", ""]) {
			await expect(createClient(invalid)).rejects.toMatchObject({
				status: "BAD_REQUEST",
				body: { error: "invalid_client_metadata" },
			});
		}
	});
});

describe("oauth client secret expiry - registration expiry in the past", async () => {
	const { auth, headers, requestToken } = await createInstance("1h ago");

	it("rejects a dynamically registered client whose secret has already expired", async () => {
		const registered = await auth.api.registerOAuthClient({
			headers,
			body: {
				grant_types: ["client_credentials"],
				token_endpoint_auth_method: "client_secret_basic",
			},
		});
		expect(registered.client_secret_expires_at).toBe(
			registered.client_id_issued_at! - 3600,
		);

		const response = await requestToken(
			registered.client_id,
			registered.client_secret!,
		);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: "invalid_client" });
	});
});
