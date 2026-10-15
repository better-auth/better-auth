import type { GenericEndpointContext } from "@better-auth/core";
import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it, vi } from "vitest";
import { storeClientApproval } from "./client-approval";
import { oauthProvider } from "./oauth";
import { registerClientMetadataDocument } from "./register";
import { buildSignedOAuthQuery } from "./signed-query";
import type {
	OAuthOptions,
	PendingClientApproval,
	PendingClientApprovalContext,
	SchemaClient,
	Scope,
} from "./types";
import type { OAuthClient } from "./types/oauth";

const baseUrl = "http://localhost:3000";
const redirectUri = "https://rp.example.com/callback";
const scopes = [
	"openid",
	"profile",
	"email",
	"offline_access",
	"invoices:write",
];

function jsonHeaders(headers?: Headers) {
	const merged = new Headers(headers);
	merged.set("content-type", "application/json");
	return merged;
}

type Options = OAuthOptions<Scope[]>;
type Approve = NonNullable<Options["approvePendingClient"]>;

// Set OAUTH_PROVIDER_TEST_ADAPTERS=sqlite,postgres to run the suite against a
// real database (see docker-compose.yml).
const adapters = (process.env.OAUTH_PROVIDER_TEST_ADAPTERS ?? "sqlite").split(
	",",
) as ("sqlite" | "postgres" | "mysql" | "mongodb")[];

async function createInstance(
	testWith: (typeof adapters)[number],
	options: Partial<Options>,
) {
	const {
		auth,
		testUser,
		signInWithTestUser,
		signInWithUser,
		customFetchImpl,
	} = await getTestInstance(
		{
			baseURL: baseUrl,
			plugins: [
				jwt({ jwt: { issuer: baseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
					allowUnauthenticatedClientRegistration: true,
					scopes,
					...options,
				}),
			],
		},
		{ testWith, transaction: true },
	);
	const context = await auth.$context;

	const register = async (body: Record<string, unknown>, headers?: Headers) => {
		const response = await customFetchImpl(
			`${baseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: jsonHeaders(headers),
				body: JSON.stringify({
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "client_secret_post",
					grant_types: ["authorization_code", "client_credentials"],
					response_types: ["code"],
					...body,
				}),
			},
		);
		return {
			status: response.status,
			body: (await response.json()) as OAuthClient & { error?: string },
		};
	};
	const row = (clientId: string) =>
		context.adapter.findOne<SchemaClient>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
	const consents = (clientId: string) =>
		context.adapter.findMany<{ userId: string }>({
			model: "oauthConsent",
			where: [{ field: "clientId", value: clientId }],
		});
	const authorize = async (clientId: string, headers: Headers, extra = {}) => {
		const codeVerifier = generateRandomString(64);
		const url = await createAuthorizationURL({
			id: "rp",
			options: { clientId, redirectURI: redirectUri },
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
			state: "state",
			scopes: ["openid"],
			codeVerifier,
		});
		for (const [key, value] of Object.entries(extra)) {
			url.searchParams.set(key, String(value));
		}
		const response = await customFetchImpl(url.toString(), {
			headers,
			redirect: "manual",
		});
		return {
			codeVerifier,
			location: response.headers.get("location") ?? "",
		};
	};
	const consent = async (location: string, headers: Headers) => {
		const oauthQuery = buildSignedOAuthQuery(new URL(location, baseUrl).search);
		const response = await customFetchImpl(
			`${baseUrl}/api/auth/oauth2/consent`,
			{
				method: "POST",
				headers: jsonHeaders(headers),
				body: JSON.stringify({ accept: true, oauth_query: oauthQuery }),
			},
		);
		return {
			status: response.status,
			body: (await response.json()) as {
				url?: string;
				error?: string;
				error_description?: string;
			},
		};
	};
	const clientCredentials = async (
		clientId: string,
		clientSecret: string,
		scope = "invoices:write",
	) => {
		const response = await customFetchImpl(`${baseUrl}/api/auth/oauth2/token`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: clientId,
				client_secret: clientSecret,
				scope,
			}),
		});
		return {
			status: response.status,
			body: (await response.json()) as {
				access_token?: string;
				error?: string;
				error_description?: string;
			},
		};
	};
	const exchange = async (body: URLSearchParams, headers: HeadersInit) => {
		const response = await customFetchImpl(`${baseUrl}/api/auth/oauth2/token`, {
			method: "POST",
			body: body.toString(),
			headers,
		});
		return { status: response.status };
	};
	const registerPending = async () => {
		const { status, body } = await register({});
		expect(status).toBe(201);
		return { clientId: body.client_id, clientSecret: body.client_secret! };
	};

	return {
		auth,
		testUser,
		customFetchImpl,
		context,
		signInWithTestUser,
		signInWithUser,
		register,
		registerPending,
		row,
		consents,
		authorize,
		consent,
		clientCredentials,
		exchange,
	};
}

describe.each(adapters)("approvePendingClient on %s", (testWith) => {
	it("keeps open registration unchanged when the option is off", async () => {
		const t = await createInstance(testWith, {});
		const unauthenticated = await t.register({
			grant_types: ["authorization_code"],
		});
		expect(unauthenticated.status).toBe(201);
		expect((await t.row(unauthenticated.body.client_id))?.pending).toBeFalsy();

		const clientCredentialsGrant = await t.register({});
		expect(clientCredentialsGrant.status).toBe(400);
		expect(clientCredentialsGrant.body.error).toBe("invalid_client_metadata");

		const { headers } = await t.signInWithTestUser();
		const { location } = await t.authorize(
			unauthenticated.body.client_id,
			headers,
		);
		const result = await t.consent(location, headers);
		expect(result.status).toBe(200);
		expect(new URL(result.body.url!).searchParams.get("code")).toBeTruthy();
	});

	it("stores an ownerless open registration as pending and blocks every token path", async () => {
		const approve = vi.fn<Approve>(() => false);
		const t = await createInstance(testWith, { approvePendingClient: approve });
		const { clientId, clientSecret } = await t.registerPending();

		const stored = await t.row(clientId);
		expect(stored?.pending).toBe(true);
		expect(stored?.userId ?? null).toBeNull();
		expect(stored?.referenceId ?? null).toBeNull();
		expect(stored?.clientCredentialsScopes ?? []).toEqual([]);

		const token = await t.clientCredentials(clientId, clientSecret);
		expect(token.status).toBe(400);
		expect(token.body.error).toBe("invalid_client");
		expect(token.body.error_description).toBe("client is pending approval");

		const { headers } = await t.signInWithTestUser();
		const prompt = await t.authorize(clientId, headers);
		expect(prompt.location).toContain("/consent");
		expect(
			new URL(prompt.location, baseUrl).searchParams.get("code"),
		).toBeNull();

		const silent = await t.authorize(clientId, headers, { prompt: "none" });
		const silentUrl = new URL(silent.location);
		expect(silentUrl.searchParams.get("error")).toBe("consent_required");
		expect(silentUrl.searchParams.get("code")).toBeNull();
		expect(approve).not.toHaveBeenCalled();
	});

	it("ignores approval state, owner, and ceiling in the registration request", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => false,
		});
		const registered = await t.register({
			pending: false,
			reference_id: "business_1",
			user_id: "someone",
			client_credentials_scopes: ["invoices:write"],
			metadata: { pending: false },
		});
		expect(registered.status).toBe(201);
		const stored = await t.row(registered.body.client_id);
		expect(stored?.pending).toBe(true);
		expect(stored?.referenceId ?? null).toBeNull();
		expect(stored?.userId ?? null).toBeNull();
		expect(stored?.clientCredentialsScopes ?? []).toEqual([]);
	});

	it("does not mark clients registered by a signed-in user as pending", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => false,
		});
		const { headers } = await t.signInWithTestUser();
		const registered = await t.register({}, headers);
		expect(registered.status).toBe(201);
		const stored = await t.row(registered.body.client_id);
		expect(stored?.pending).toBeFalsy();
		expect(stored?.userId).toEqual(expect.any(String));
	});

	it("always asks a pending client for consent, even with skipConsent", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => false,
		});
		const { clientId } = await t.registerPending();
		await t.context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update: { skipConsent: true },
		});
		const { headers } = await t.signInWithTestUser();
		const { location } = await t.authorize(clientId, headers);
		expect(location).toContain("/consent");
	});

	it("sets the owner atomically with consent and leaves machine access to an administrator", async () => {
		const approve = vi.fn<Approve>(() => ({ clientReference: "business_1" }));
		const t = await createInstance(testWith, {
			approvePendingClient: approve,
			clientPrivileges: ({ action }) =>
				action === "update" || action === "configure-client-credentials-scopes",
		});
		const { clientId, clientSecret } = await t.registerPending();
		const { headers } = await t.signInWithTestUser();
		const { location, codeVerifier } = await t.authorize(clientId, headers, {
			scope: "openid invoices:write",
		});

		const result = await t.consent(location, headers);
		expect(result.status).toBe(200);
		const callback = new URL(result.body.url!);
		const code = callback.searchParams.get("code");
		expect(code).toEqual(expect.any(String));

		expect(approve).toHaveBeenCalledTimes(1);
		const context = approve.mock.calls[0]![0] as PendingClientApprovalContext<
			Scope[]
		>;
		expect(context.client.client_id).toBe(clientId);
		expect(context.client.client_secret).toBeUndefined();
		expect(context.user.email).toEqual(expect.any(String));
		expect(context.scopes).toEqual(["openid", "invoices:write"]);
		expect(context.headers).toBeInstanceOf(Headers);

		const stored = await t.row(clientId);
		expect(stored?.pending).toBe(false);
		expect(stored?.referenceId).toBe("business_1");
		expect(stored?.userId ?? null).toBeNull();
		expect(stored?.clientCredentialsScopes ?? []).toEqual([]);
		expect(await t.consents(clientId)).toHaveLength(1);

		const { body: tokenBody, headers: tokenHeaders } =
			await authorizationCodeRequest({
				code: code!,
				codeVerifier,
				redirectURI: redirectUri,
				options: { clientId, clientSecret, redirectURI: redirectUri },
			});
		const exchange = await t.exchange(tokenBody, tokenHeaders);
		expect(exchange.status).toBe(200);

		// Accepting consent grants no machine access.
		const beforeAdmin = await t.clientCredentials(clientId, clientSecret);
		expect(beforeAdmin.status).toBe(400);
		expect(beforeAdmin.body.access_token).toBeUndefined();

		await t.auth.api.adminUpdateOAuthClient({
			headers,
			body: {
				client_id: clientId,
				update: { client_credentials_scopes: ["invoices:write"] },
			},
		});
		const token = await t.clientCredentials(clientId, clientSecret);
		expect(token.status).toBe(200);
		expect(token.body.access_token).toEqual(expect.any(String));
	});

	it("refuses an approval that names no owner", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => ({}) as PendingClientApproval,
		});
		const { clientId } = await t.registerPending();
		const { headers } = await t.signInWithTestUser();
		const { location } = await t.authorize(clientId, headers);
		const result = await t.consent(location, headers);
		expect(result.status).toBe(500);
		const stored = await t.row(clientId);
		expect(stored?.pending).toBe(true);
		expect(stored?.userId ?? null).toBeNull();
		expect(await t.consents(clientId)).toHaveLength(0);
	});

	it("redirects a refusal to the client with access_denied and stores nothing", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => false,
		});
		const { clientId } = await t.registerPending();
		const { headers } = await t.signInWithTestUser();
		const { location } = await t.authorize(clientId, headers);
		const result = await t.consent(location, headers);
		expect(result.status).toBe(200);
		const callback = new URL(result.body.url!);
		expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
		expect(callback.searchParams.get("error")).toBe("access_denied");
		expect(callback.searchParams.get("state")).toBe("state");
		expect(callback.searchParams.get("code")).toBeNull();
		const stored = await t.row(clientId);
		expect(stored?.pending).toBe(true);
		expect(stored?.userId ?? null).toBeNull();
		expect(await t.consents(clientId)).toHaveLength(0);
	});

	it("passes an application error from the callback through unchanged", async () => {
		const { APIError } = await import("better-auth/api");
		const t = await createInstance(testWith, {
			approvePendingClient: () => {
				throw new APIError("FORBIDDEN", {
					error: "access_denied",
					error_description:
						"Only business administrators can connect this client",
				});
			},
		});
		const { clientId } = await t.registerPending();
		const { headers } = await t.signInWithTestUser();
		const { location } = await t.authorize(clientId, headers);
		const result = await t.consent(location, headers);
		expect(result.status).toBe(403);
		expect(result.body.error_description).toBe(
			"Only business administrators can connect this client",
		);
		expect((await t.row(clientId))?.pending).toBe(true);
	});

	it("never reassigns an approved client and skips the callback for it", async () => {
		const approve = vi.fn<Approve>(() => ({ clientReference: "business_1" }));
		const t = await createInstance(testWith, { approvePendingClient: approve });
		const { clientId } = await t.registerPending();
		const first = await t.signInWithTestUser();
		const { location } = await t.authorize(clientId, first.headers);
		expect((await t.consent(location, first.headers)).status).toBe(200);
		expect(approve).toHaveBeenCalledTimes(1);

		await t.auth.api.signUpEmail({
			body: { email: "other@test.com", password: "test123456", name: "Other" },
		});
		const other = await t.signInWithUser("other@test.com", "test123456");
		approve.mockReturnValue({ clientReference: "business_2" });
		const again = await t.authorize(clientId, other.headers);
		expect((await t.consent(again.location, other.headers)).status).toBe(200);

		expect(approve).toHaveBeenCalledTimes(1);
		const stored = await t.row(clientId);
		expect(stored?.referenceId).toBe("business_1");
		expect(await t.consents(clientId)).toHaveLength(2);
	});

	it("lets exactly one of two concurrent approvals win", async () => {
		// Hold both approvals inside the callback so each one saw a pending client.
		let entered = 0;
		let release!: () => void;
		const bothEntered = new Promise<void>((resolve) => {
			release = resolve;
		});
		const approve = vi.fn<Approve>(async ({ user }) => {
			if (++entered === 2) release();
			await bothEntered;
			return { clientReference: `business_for_${user.email}` };
		});
		const t = await createInstance(testWith, { approvePendingClient: approve });
		const { clientId } = await t.registerPending();
		const first = await t.signInWithTestUser();
		await t.auth.api.signUpEmail({
			body: { email: "other@test.com", password: "test123456", name: "Other" },
		});
		const other = await t.signInWithUser("other@test.com", "test123456");
		const { location } = await t.authorize(clientId, first.headers);

		const results = await Promise.all([
			t.consent(location, first.headers),
			t.consent(location, other.headers),
		]);

		expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
		const stored = await t.row(clientId);
		expect(stored?.pending).toBe(false);
		const winner = results.findIndex((result) => result.status === 200);
		expect(stored?.referenceId).toBe(
			`business_for_${winner === 0 ? t.testUser.email : "other@test.com"}`,
		);
		expect(await t.consents(clientId)).toHaveLength(1);
	});

	it("does not take over a client that already has an owner", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => ({ clientReference: "intruder" }),
		});
		const { clientId } = await t.registerPending();
		await t.context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update: { referenceId: "business_1" },
		});
		const { headers } = await t.signInWithTestUser();
		const { location } = await t.authorize(clientId, headers, {
			scope: "openid invoices:write",
		});
		const result = await t.consent(location, headers);
		expect(result.status).toBe(409);
		const stored = await t.row(clientId);
		expect(stored?.referenceId).toBe("business_1");
		expect(stored?.pending).toBe(true);
		expect(await t.consents(clientId)).toHaveLength(0);
	});

	it("rolls the approval back with the surrounding transaction", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => false,
		});
		const { clientId } = await t.registerPending();
		await expect(
			runWithTransaction(t.context.adapter, async () => {
				const adapter = await getCurrentAdapter(t.context.adapter);
				await storeClientApproval(adapter, {}, clientId, "business_1");
				throw new Error("consent write failed");
			}),
		).rejects.toThrow("consent write failed");
		const stored = await t.row(clientId);
		expect(stored?.pending).toBe(true);
		expect(stored?.referenceId ?? null).toBeNull();
	});

	it("keeps a pending client unusable when the callback is no longer configured", async () => {
		const t = await createInstance(testWith, {});
		const { clientId, clientSecret } = await t
			.registerPending()
			.catch(async () => {
				const registered = await t.register({
					grant_types: ["authorization_code"],
				});
				return {
					clientId: registered.body.client_id,
					clientSecret: registered.body.client_secret!,
				};
			});
		await t.context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update: { pending: true },
		});
		const { headers } = await t.signInWithTestUser();
		const { location } = await t.authorize(clientId, headers);
		expect(new URL(location).searchParams.get("error")).toBe(
			"unauthorized_client",
		);
		const token = await t.clientCredentials(clientId, clientSecret);
		expect(token.status).toBe(400);
	});
	it("rejects an open registration that could never reach consent", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => false,
		});
		const registered = await t.register({
			grant_types: ["client_credentials"],
			response_types: [],
		});
		expect(registered.status).toBe(400);
		expect(registered.body.error).toBe("invalid_client_metadata");
	});

	it("does not mark clients registered with an initial access token as pending", async () => {
		const t = await createInstance(testWith, {
			allowUnauthenticatedClientRegistration: false,
			validateInitialAccessToken: () => ({}),
			approvePendingClient: () => false,
		});
		const registered = await t.register(
			{ grant_types: ["client_credentials"], response_types: [] },
			new Headers({ authorization: "Bearer initial-access-token" }),
		);
		expect(registered.status).toBe(201);
		expect((await t.row(registered.body.client_id))?.pending).toBeFalsy();
	});

	it("tells the client and the consent page that the client is pending", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => false,
		});
		const registered = await t.register({});
		expect(registered.body.pending).toBe(true);
		const { headers } = await t.signInWithTestUser();
		const response = await t.customFetchImpl(
			`${baseUrl}/api/auth/oauth2/public-client?client_id=${registered.body.client_id}`,
			{ headers },
		);
		expect(((await response.json()) as OAuthClient).pending).toBe(true);
	});

	it("never holds a discovered client and keeps a scope limit and a disable set during its refresh", async () => {
		const t = await createInstance(testWith, {
			approvePendingClient: () => false,
		});
		const opts = t.context.getPlugin("oauth-provider")!.options as Options;
		const ctx = { context: t.context } as GenericEndpointContext;
		const { publicKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const clientId = "https://cimd.example.com/client.json";
		const metadata = {
			client_id: clientId,
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "private_key_jwt" as const,
			grant_types: ["authorization_code", "client_credentials"] as const,
			response_types: ["code" as const],
			jwks: {
				keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }],
			},
		};
		const discover = (existingClient?: SchemaClient<Scope[]>) =>
			registerClientMetadataDocument(ctx, opts, {
				clientId,
				clientDiscoveryId: "cimd",
				metadata: { ...metadata, grant_types: [...metadata.grant_types] },
				existingClient,
			});
		await discover();
		const snapshot = (await t.row(clientId)) as SchemaClient<Scope[]>;
		// One discovered client serves every user of the software, so it never
		// waits for an owner.
		expect(snapshot.pending ?? false).toBe(false);
		expect(snapshot.referenceId ?? null).toBeNull();

		// An administrator writes while the refresh is fetching metadata.
		await t.context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update: { clientCredentialsScopes: ["invoices:write"], disabled: true },
		});
		await discover(snapshot);

		const stored = await t.row(clientId);
		expect(stored?.pending ?? false).toBe(false);
		expect(stored?.clientCredentialsScopes).toEqual(["invoices:write"]);
		expect(stored?.disabled).toBe(true);
	});
});
