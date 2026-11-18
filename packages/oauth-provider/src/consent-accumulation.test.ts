import { generateRandomString } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { base64url } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthConsent, Scope } from "./types";
import type { OAuthClient } from "./types/oauth";

const baseURL = "http://localhost:3000";
const redirectUri = "http://localhost:5000/api/auth/callback/test";
const firstResource = "https://first.example.com";
const secondResource = "https://second.example.com";
const formHeaders = { "content-type": "application/x-www-form-urlencoded" };

interface AuthorizationRequest {
	scope: string;
	prompt?: string;
	resource?: string;
	claims?: object;
}

interface ConsentAnswer {
	scope?: string;
	claims?: object;
}

interface PendingCode {
	code: string;
	codeVerifier: string;
}

/**
 * A stored consent is what the user approved for a client under one reference
 * and did not take back. An approval adds to it, and only the user removes
 * from it: by declining an offered scope or claim, by narrowing it, or by
 * deleting it.
 */
describe("oauth-provider - a stored consent keeps earlier approvals", async () => {
	// The reference the next authorization request stores its consent under.
	const state: { referenceId?: string } = {};
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [firstResource, secondResource],
					enforcePerClientResources: false,
					postLogin: {
						page: "/select-organization",
						shouldRedirect: () => false,
						consentReferenceId: () => state.referenceId,
					},
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers, user } = await signInWithTestUser();
	const { adapter } = await auth.$context;

	// A client of its own keeps one test's stored consent from reaching another.
	let oauthClient: OAuthClient;
	beforeEach(async () => {
		state.referenceId = undefined;
		oauthClient = (await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				scope: "openid profile email offline_access",
			},
		}))!;
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	/** Sends a browser request and returns the URL the provider sends it to. */
	async function fetchRedirect(
		path: string,
		init: { method?: "POST"; body?: Record<string, unknown> } = {},
	) {
		const requestHeaders = new Headers(headers);
		requestHeaders.set("accept", "application/json");
		const { data, error } = await client.$fetch<{ url: string }>(path, {
			...init,
			headers: requestHeaders,
		});
		if (error || !data) throw error;
		return new URL(data.url, baseURL);
	}

	/**
	 * Sends an authorization request. Returns the code when the provider skips
	 * the consent page, or the signed query of the consent page it shows.
	 */
	async function startAuthorization(request: AuthorizationRequest) {
		const codeVerifier = generateRandomString(43, "a-z", "A-Z", "0-9");
		const challenge = base64url.encode(
			new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(codeVerifier),
				),
			),
		);
		const query = new URLSearchParams({
			client_id: oauthClient.client_id,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: request.scope,
			state: "state",
			code_challenge: challenge,
			code_challenge_method: "S256",
		});
		if (request.prompt) query.set("prompt", request.prompt);
		if (request.resource) query.set("resource", request.resource);
		if (request.claims) query.set("claims", JSON.stringify(request.claims));
		const landing = await fetchRedirect(`/oauth2/authorize?${query}`);
		const code = landing.searchParams.get("code");
		return code
			? { codeVerifier, code, consentQuery: undefined }
			: {
					codeVerifier,
					code: undefined,
					consentQuery: landing.search.slice(1),
				};
	}

	/** Opens the consent page for `request` and approves it with `answer`. */
	async function openConsent(request: AuthorizationRequest) {
		const pending = await startAuthorization(request);
		expect(pending.consentQuery, "the consent page shows").toBeDefined();
		return {
			approve: async (answer: ConsentAnswer = {}): Promise<PendingCode> => {
				const landing = await fetchRedirect("/oauth2/consent", {
					method: "POST",
					body: { accept: true, ...answer, oauth_query: pending.consentQuery },
				});
				const code = landing.searchParams.get("code");
				expect(code).toBeTruthy();
				return { code: code!, codeVerifier: pending.codeVerifier };
			},
		};
	}

	async function approve(
		request: AuthorizationRequest,
		answer?: ConsentAnswer,
	) {
		return (await openConsent(request)).approve(answer);
	}

	function redeem({ code, codeVerifier }: PendingCode) {
		return client.$fetch<{
			access_token: string;
			refresh_token?: string;
			scope: string;
		}>("/oauth2/token", {
			method: "POST",
			headers: formHeaders,
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				code_verifier: codeVerifier,
				redirect_uri: redirectUri,
				client_id: oauthClient.client_id,
				client_secret: oauthClient.client_secret!,
			}),
		});
	}

	function findConsentRows(referenceId?: string) {
		return adapter.findMany<OAuthConsent<Scope[]>>({
			model: "oauthConsent",
			where: [
				{ field: "clientId", value: oauthClient.client_id },
				{ field: "userId", value: user.id },
				{ field: "referenceId", value: referenceId ?? null },
			],
		});
	}

	async function findStoredConsent(referenceId?: string) {
		const rows = await findConsentRows(referenceId);
		expect(rows).toHaveLength(1);
		return rows[0]!;
	}

	function storeConsentRow(scopes: string[], createdAt: Date) {
		return adapter.create<OAuthConsent<Scope[]>>({
			model: "oauthConsent",
			data: {
				clientId: oauthClient.client_id,
				userId: user.id,
				scopes,
				createdAt,
				updatedAt: createdAt,
			},
		});
	}

	/**
	 * Holds every consent read until `count` of them have read, so the
	 * approvals behind them read the same stored consent before either writes.
	 * A consent with a reference takes one read.
	 */
	function holdConsentReads(count: number) {
		const findMany = adapter.findMany.bind(adapter);
		const held: (() => void)[] = [];
		const spy = vi.spyOn(adapter, "findMany");
		spy.mockImplementation(async (args) => {
			const rows = await findMany(args);
			if (args.model === "oauthConsent" && held.length < count) {
				await new Promise<void>((resolve) => {
					held.push(resolve);
					if (held.length === count) {
						spy.mockRestore();
						for (const release of held) release();
					}
				});
			}
			return rows;
		});
	}

	it("keeps scopes an earlier approval granted when a later one grants fewer", async () => {
		const wider = await approve({ scope: "openid offline_access" });
		const narrower = await approve({ scope: "openid", prompt: "consent" });

		expect((await findStoredConsent()).scopes).toEqual([
			"openid",
			"offline_access",
		]);
		const widerTokens = await redeem(wider);
		expect(widerTokens.error).toBeNull();
		expect(widerTokens.data?.refresh_token).toBeDefined();
		const narrowerTokens = await redeem(narrower);
		expect(narrowerTokens.error).toBeNull();
		expect(narrowerTokens.data?.scope).toBe("openid");
		// A request for what the user approved earlier skips the consent page.
		const again = await startAuthorization({ scope: "openid offline_access" });
		expect(again.code).toBeTruthy();
	});

	it("removes a scope the user declined on the consent page", async () => {
		await approve({ scope: "openid profile email" });
		await approve(
			{ scope: "openid profile", prompt: "consent" },
			{ scope: "openid" },
		);

		// `email` was not offered the second time, so it stays.
		expect((await findStoredConsent()).scopes).toEqual(["openid", "email"]);
		const again = await startAuthorization({ scope: "openid profile" });
		expect(again.consentQuery).toBeDefined();
	});

	it("adds resources, and removes a UserInfo claim the user declined", async () => {
		await approve({
			scope: "openid",
			resource: firstResource,
			claims: { userinfo: { email: null } },
		});
		await approve({
			scope: "openid",
			resource: secondResource,
			claims: { userinfo: { name: null } },
		});
		expect(await findStoredConsent()).toMatchObject({
			resources: [firstResource, secondResource],
			requestedUserInfoClaims: ["email", "name"],
		});

		await approve(
			{
				scope: "openid",
				prompt: "consent",
				claims: { userinfo: { email: null, name: null } },
			},
			{ claims: { userinfo: { name: null } } },
		);
		expect(await findStoredConsent()).toMatchObject({
			resources: [firstResource, secondResource],
			requestedUserInfoClaims: ["name"],
		});
	});

	it("keeps the consent of each reference apart", async () => {
		state.referenceId = "org_a";
		await approve({ scope: "openid offline_access" });
		state.referenceId = "org_b";
		await approve({ scope: "openid profile" }, { scope: "openid" });

		expect((await findStoredConsent("org_a")).scopes).toEqual([
			"openid",
			"offline_access",
		]);
		expect((await findStoredConsent("org_b")).scopes).toEqual(["openid"]);
		expect(await findConsentRows()).toHaveLength(0);
	});

	it("narrows a consent with updateOAuthConsent without revoking its tokens", async () => {
		const tokens = await redeem(
			await approve({ scope: "openid offline_access" }),
		);
		expect(tokens.data?.refresh_token).toBeDefined();
		const consent = await findStoredConsent();

		const updated = await client.oauth2.updateConsent(
			{ id: consent.id, update: { scopes: ["openid"] } },
			{ headers },
		);
		expect(updated.error).toBeNull();
		expect(updated.data?.scopes).toEqual(["openid"]);
		expect((await findStoredConsent()).scopes).toEqual(["openid"]);

		const refreshed = await client.$fetch<{ access_token: string }>(
			"/oauth2/token",
			{
				method: "POST",
				headers: formHeaders,
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: tokens.data!.refresh_token!,
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
				}),
			},
		);
		expect(refreshed.error).toBeNull();
		expect(refreshed.data?.access_token).toBeDefined();
		const again = await startAuthorization({ scope: "openid offline_access" });
		expect(again.consentQuery).toBeDefined();
	});

	it("keeps what each of two concurrent approvals adds", async () => {
		state.referenceId = "org_a";
		await approve({ scope: "openid" });
		const withProfile = await openConsent({ scope: "openid profile" });
		const withEmail = await openConsent({ scope: "openid email" });

		holdConsentReads(2);
		await Promise.all([withProfile.approve(), withEmail.approve()]);

		const { scopes } = await findStoredConsent("org_a");
		expect([...scopes].sort()).toEqual(["email", "openid", "profile"]);
	});

	it("merges the rows of two concurrent first approvals", async () => {
		state.referenceId = "org_a";
		const withProfile = await openConsent({ scope: "openid profile" });
		const withEmail = await openConsent({ scope: "openid email" });

		holdConsentReads(2);
		await Promise.all([withProfile.approve(), withEmail.approve()]);
		expect(await findConsentRows("org_a")).toHaveLength(2);

		// Reads merge the rows, so the consent covers both approvals.
		const covered = await startAuthorization({ scope: "openid profile email" });
		expect(covered.code).toBeTruthy();
		// The next approval keeps one row.
		await approve({ scope: "openid offline_access" });
		const { scopes } = await findStoredConsent("org_a");
		expect([...scopes].sort()).toEqual([
			"email",
			"offline_access",
			"openid",
			"profile",
		]);
	});

	it("does not bring back a declined scope from a row another approval reads", async () => {
		await storeConsentRow(["openid", "email"], new Date(1_000_000));
		await storeConsentRow(["profile"], new Date(2_000_000));
		const declining = await openConsent({
			scope: "openid profile",
			prompt: "consent",
		});
		const adding = await openConsent({ scope: "openid offline_access" });

		// The other approval runs while the declining one removes a duplicate,
		// so it reads the duplicate that still holds `profile`.
		const remove = adapter.delete.bind(adapter);
		let raced = false;
		vi.spyOn(adapter, "delete").mockImplementation(async (args) => {
			if (args.model === "oauthConsent" && !raced) {
				raced = true;
				await adding.approve();
			}
			return remove(args);
		});
		await declining.approve({ scope: "openid" });

		expect(raced).toBe(true);
		const { scopes } = await findStoredConsent();
		expect([...scopes].sort()).toEqual(["email", "offline_access", "openid"]);
	});

	it("reads, updates, and deletes every row stored for the same reference", async () => {
		const older = await storeConsentRow(["openid"], new Date(1_000_000));
		const newer = await storeConsentRow(["profile"], new Date(2_000_000));

		const read = await client.oauth2.getConsent(
			{ query: { id: newer.id } },
			{ headers },
		);
		expect(read.data).toMatchObject({
			id: older.id,
			scopes: ["openid", "profile"],
		});

		const updated = await client.oauth2.updateConsent(
			{ id: older.id, update: { scopes: ["openid", "email"] } },
			{ headers },
		);
		expect(updated.error).toBeNull();
		const consent = await findStoredConsent();
		expect(consent).toMatchObject({
			id: older.id,
			scopes: ["openid", "email"],
		});

		await storeConsentRow(["profile"], new Date(3_000_000));
		const deleted = await client.oauth2.deleteConsent(
			{ id: consent.id },
			{ headers },
		);
		expect(deleted.error).toBeNull();
		expect(await findConsentRows()).toHaveLength(0);
	});

	it("writes without the timestamp guard when it cannot match the stored row", async () => {
		await approve({ scope: "openid" });
		const incrementOne = adapter.incrementOne.bind(adapter);
		const spy = vi.spyOn(adapter, "incrementOne");
		// A guard that misses while no other write moves `updatedAt`.
		spy.mockImplementation(async (args) =>
			args.model === "oauthConsent" &&
			args.where.some(({ field }) => field === "updatedAt")
				? null
				: incrementOne(args),
		);

		await approve({ scope: "openid profile" });
		expect((await findStoredConsent()).scopes).toEqual(["openid", "profile"]);
		const consentWrites = spy.mock.calls.filter(
			([args]) => args.model === "oauthConsent",
		);
		expect(consentWrites).toHaveLength(2);
	});
});
