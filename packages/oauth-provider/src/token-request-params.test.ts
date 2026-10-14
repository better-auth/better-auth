import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";

const baseURL = "http://localhost:3000";
const resource = "https://api.example.com";

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-3.2
 * @see https://datatracker.ietf.org/doc/html/rfc8707#section-2
 */
describe("token endpoint request parameters", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["m2m:read"],
				clientPrivileges: ({ action }) =>
					action === "create" ||
					action === "configure-client-credentials-scopes",
			}),
		],
	});

	let clientId = "";
	let clientSecret = "";

	beforeAll(async () => {
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["client_credentials", "authorization_code"],
				redirect_uris: ["http://localhost:5000/callback"],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
				client_credentials_scopes: ["m2m:read"],
			},
		});
		clientId = client.client_id;
		clientSecret = client.client_secret!;
	});

	async function postToken(params: [string, string][]) {
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams([
					["client_id", clientId],
					["client_secret", clientSecret],
					...params,
				]),
			}),
		);
		const body = (await response.json()) as {
			error?: string;
			error_description?: string;
			access_token?: string;
		};
		return { response, body };
	}

	it("issues a token for a request with no repeated parameters", async () => {
		const { response, body } = await postToken([
			["grant_type", "client_credentials"],
			["scope", "m2m:read"],
		]);
		expect(response.status).toBe(200);
		expect(body.access_token).toBeDefined();
	});

	it.each([
		[
			"grant_type",
			[
				["grant_type", "client_credentials"],
				["grant_type", "client_credentials"],
			],
		],
		[
			"scope",
			[
				["grant_type", "client_credentials"],
				["scope", "m2m:read"],
				["scope", "m2m:read"],
			],
		],
		[
			"code",
			[
				["grant_type", "authorization_code"],
				["code", "garbage"],
				["code", "another"],
			],
		],
		[
			"refresh_token",
			[
				["grant_type", "refresh_token"],
				["refresh_token", "garbage"],
				["refresh_token", "another"],
			],
		],
	] as [
		string,
		[string, string][],
	][])("rejects a repeated %s parameter with invalid_request", async (name, params) => {
		const { response, body } = await postToken(params);
		expect(response.status).toBe(400);
		expect(body).toEqual({
			error: "invalid_request",
			error_description: `${name} must not be repeated`,
		});
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("allows the audience parameter to repeat", async () => {
		const { response } = await postToken([
			["grant_type", "client_credentials"],
			["audience", "https://a.example.com"],
			["audience", "https://b.example.com"],
		]);
		expect(response.status).toBe(200);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-3.2
	 */
	it.each([
		["a single empty resource", [["resource", ""]]],
		[
			"repeated empty resources",
			[
				["resource", ""],
				["resource", ""],
			],
		],
	] as [
		string,
		[string, string][],
	][])("treats %s as omitted", async (_label, params) => {
		const { response, body } = await postToken([
			["grant_type", "client_credentials"],
			...params,
		]);
		expect(response.status).toBe(200);
		expect(body.access_token).toBeDefined();
	});

	it.each([
		["a fragment", [["resource", `${resource}#fragment`]]],
		["a relative URI", [["resource", "/api"]]],
		[
			"a relative URI before an empty one",
			[
				["resource", "/api"],
				["resource", ""],
			],
		],
		[
			"a relative URI before a valid one",
			[
				["resource", "/api"],
				["resource", resource],
			],
		],
	] as [
		string,
		[string, string][],
	][])("rejects a resource with %s as invalid_target", async (_label, params) => {
		const { response, body } = await postToken([
			["grant_type", "client_credentials"],
			...params,
		]);
		expect(response.status).toBe(400);
		expect(body.error).toBe("invalid_target");
		expect(response.headers.get("cache-control")).toBe("no-store");
	});
});
