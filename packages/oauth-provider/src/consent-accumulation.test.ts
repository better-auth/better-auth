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
 * deleting it. Redemption checks read it, so it must keep what the user
 * approved for pending codes.
 *
 * @see https://github.com/better-auth/better-auth/issues/11318
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

	function storeConsentRow(
		scopes: string[],
		createdAt: Date,
		referenceId?: string,
		id?: string,
	) {
		return adapter.create<OAuthConsent<Scope[]>>({
			model: "oauthConsent",
			data: {
				clientId: oauthClient.client_id,
				userId: user.id,
				scopes,
				createdAt,
				updatedAt: createdAt,
				...(referenceId === undefined ? {} : { referenceId }),
				...(id === undefined ? {} : { id }),
			},
			forceAllowId: id !== undefined,
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
		const consume = adapter.consumeOne.bind(adapter);
		let raced = false;
		vi.spyOn(adapter, "consumeOne").mockImplementation(async (args) => {
			if (args.model === "oauthConsent" && !raced) {
				raced = true;
				await adding.approve();
			}
			return consume(args);
		});
		await declining.approve({ scope: "openid" });

		expect(raced).toBe(true);
		const { scopes } = await findStoredConsent();
		expect([...scopes].sort()).toEqual(["email", "offline_access", "openid"]);
	});

	it("does not bring back a declined scope from a duplicate read before the decline", async () => {
		// Rows without a reference are read twice: those stored with `null`, and
		// those stored with "". The duplicate is read first.
		await storeConsentRow(["openid", "email"], new Date(1_000_000), "");
		await storeConsentRow(["profile"], new Date(2_000_000));
		const declining = await openConsent({
			scope: "openid profile",
			prompt: "consent",
		});
		const adding = await openConsent({ scope: "openid offline_access" });

		// The other approval reads the duplicate before the declining one
		// removes it, and reads the oldest row after the decline is written.
		const findMany = adapter.findMany.bind(adapter);
		let duplicateRead!: () => void;
		const readDuplicate = new Promise<void>((resolve) => {
			duplicateRead = resolve;
		});
		let releaseOldest!: () => void;
		const oldestHeld = new Promise<void>((resolve) => {
			releaseOldest = resolve;
		});
		const reads = { duplicate: 0, oldest: 0 };
		vi.spyOn(adapter, "findMany").mockImplementation(async (args) => {
			const reference =
				args.model === "oauthConsent"
					? args.where?.find(({ field }) => field === "referenceId")?.value
					: undefined;
			if (reference === "" && reads.oldest++ === 0) await oldestHeld;
			const rows = await findMany(args);
			if (reference === null && reads.duplicate++ === 0) duplicateRead();
			return rows;
		});
		const added = adding.approve();
		await readDuplicate;
		await declining.approve({ scope: "openid" });
		releaseOldest();
		await added;

		expect(await findConsentRows()).toHaveLength(0);
		const { scopes } = await findStoredConsent("");
		expect([...scopes].sort()).toEqual(["email", "offline_access", "openid"]);
	});

	it("does not bring back a duplicate's scope that a narrowing removed while the duplicate was merged", async () => {
		const older = await storeConsentRow(
			["openid", "profile"],
			new Date(1_000_000),
		);
		await storeConsentRow(["email"], new Date(2_000_000));
		const adding = await openConsent({
			scope: "openid offline_access",
			prompt: "consent",
		});

		// The user narrows the consent after the approval consumed the duplicate
		// and before the approval writes, so the narrowing never sees `email`.
		const consume = adapter.consumeOne.bind(adapter);
		let narrowed = false;
		vi.spyOn(adapter, "consumeOne").mockImplementation(async (args) => {
			const row = await consume(args);
			if (args.model === "oauthConsent" && !narrowed) {
				narrowed = true;
				const updated = await client.oauth2.updateConsent(
					{ id: older.id, update: { scopes: ["openid"] } },
					{ headers },
				);
				expect(updated.error).toBeNull();
			}
			return row;
		});
		await adding.approve();

		expect(narrowed).toBe(true);
		const { scopes } = await findStoredConsent();
		expect([...scopes].sort()).toEqual(["offline_access", "openid"]);
	});

	it.each([
		{ name: "no reference", older: undefined, newer: "", other: "org_b" },
		{ name: "a reference", older: "org_a", newer: "org_a", other: undefined },
	])(
		"reads, updates, and deletes every row stored for $name",
		async ({
			older: olderReference,
			newer: newerReference,
			other: otherReference,
		}) => {
			const older = await storeConsentRow(
				["openid"],
				new Date(1_000_000),
				olderReference,
			);
			const newer = await storeConsentRow(
				["profile"],
				new Date(2_000_000),
				newerReference,
			);
			const other = await storeConsentRow(
				["email"],
				new Date(1_500_000),
				otherReference,
			);

			const read = await client.oauth2.getConsent(
				{ query: { id: newer.id } },
				{ headers },
			);
			expect(read.data).toMatchObject({
				id: older.id,
				scopes: ["openid", "profile"],
			});
			const listed = await client.oauth2.getConsents({
				fetchOptions: { headers },
			});
			const consents = listed.data
				?.filter(({ clientId }) => clientId === oauthClient.client_id)
				.map(({ id, scopes }) => ({ id, scopes }));
			expect(consents).toHaveLength(2);
			expect(consents).toEqual(
				expect.arrayContaining([
					{ id: older.id, scopes: ["openid", "profile"] },
					{ id: other.id, scopes: ["email"] },
				]),
			);

			const updated = await client.oauth2.updateConsent(
				{ id: newer.id, update: { scopes: ["openid", "email"] } },
				{ headers },
			);
			expect(updated.error).toBeNull();
			const consent = await findStoredConsent(olderReference);
			expect(consent).toMatchObject({
				id: older.id,
				scopes: ["openid", "email"],
			});
			expect(await findConsentRows(newerReference)).toHaveLength(
				newerReference === olderReference ? 1 : 0,
			);

			await storeConsentRow(["profile"], new Date(3_000_000), newerReference);
			const deleted = await client.oauth2.deleteConsent(
				{ id: consent.id },
				{ headers },
			);
			expect(deleted.error).toBeNull();
			expect(await findConsentRows(olderReference)).toHaveLength(0);
			expect(await findConsentRows(newerReference)).toHaveLength(0);
			expect(await findStoredConsent(otherReference)).toMatchObject({
				id: other.id,
				scopes: ["email"],
			});
		},
	);

	it("reads and narrows every row of a consent past one page of rows", async () => {
		state.referenceId = "org_a";
		// More rows than one `findMany` page, with the newest holding `profile`.
		for (let row = 0; row <= 100; row++) {
			await storeConsentRow(
				row === 100 ? ["profile"] : ["openid"],
				new Date(1_000_000 + row * 1000),
				"org_a",
			);
		}
		const covered = await startAuthorization({ scope: "openid profile" });
		expect(covered.code).toBeTruthy();

		const [first] = await findConsentRows("org_a");
		const updated = await client.oauth2.updateConsent(
			{ id: first!.id, update: { scopes: ["openid"] } },
			{ headers },
		);
		expect(updated.error).toBeNull();
		expect((await findStoredConsent("org_a")).scopes).toEqual(["openid"]);
		const again = await startAuthorization({ scope: "openid profile" });
		expect(again.consentQuery).toBeDefined();
	});

	it("narrows a row that a paged read missed", async () => {
		state.referenceId = "org_a";
		// Rows page by ID, so the newest row, holding `profile`, is the only one
		// on the second page.
		const ids = Array.from(
			{ length: 101 },
			(_, row) => `consent-${String(row).padStart(3, "0")}`,
		);
		for (const [row, id] of ids.entries()) {
			await storeConsentRow(
				row === 100 ? ["profile"] : ["openid"],
				new Date(1_000_000 + row * 1000),
				"org_a",
				id,
			);
		}

		// Another request removes a row of the first page before the narrowing
		// reads the second, so the newest row moves to the first page and the
		// read misses it.
		const findMany = adapter.findMany.bind(adapter);
		let removed = false;
		vi.spyOn(adapter, "findMany").mockImplementation(async (args) => {
			if (args.model === "oauthConsent" && args.offset === 100 && !removed) {
				removed = true;
				await adapter.delete({
					model: "oauthConsent",
					where: [{ field: "id", value: ids[50]! }],
				});
			}
			return findMany(args);
		});
		const updated = await client.oauth2.updateConsent(
			{ id: ids[0]!, update: { scopes: ["openid"] } },
			{ headers },
		);

		expect(removed).toBe(true);
		expect(updated.error).toBeNull();
		expect((await findStoredConsent("org_a")).scopes).toEqual(["openid"]);
		const again = await startAuthorization({ scope: "openid profile" });
		expect(again.consentQuery).toBeDefined();
	});

	it("fails rather than write a consent without the timestamp guard", async () => {
		await approve({ scope: "openid" });
		const pending = await openConsent({ scope: "openid profile" });
		const incrementOne = adapter.incrementOne.bind(adapter);
		const spy = vi.spyOn(adapter, "incrementOne");
		// A guard that keeps missing, as when other writes keep landing first.
		spy.mockImplementation(async (args) =>
			args.model === "oauthConsent" ? null : incrementOne(args),
		);

		await expect(pending.approve()).rejects.toMatchObject({ status: 503 });
		const consentWrites = spy.mock.calls.filter(
			([args]) => args.model === "oauthConsent",
		);
		expect(consentWrites).toHaveLength(5);
		for (const [args] of consentWrites) {
			expect(args.where.map(({ field }) => field)).toContain("updatedAt");
		}
		spy.mockRestore();
		expect((await findStoredConsent()).scopes).toEqual(["openid"]);
	});
});
