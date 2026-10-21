import { APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import { base64url } from "jose";
import { describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { postLoginClearedParam } from "./signed-query";
import type { OAuthOptions, Scope } from "./types";

const baseURL = "http://localhost:3000";
const redirectURI = "https://client.example.com/callback";

async function createPostLoginTestInstance() {
	const shouldRedirect =
		vi.fn<NonNullable<OAuthOptions<Scope[]>["postLogin"]>["shouldRedirect"]>();
	const instance = await getTestInstance(
		{
			baseURL,
			plugins: [
				organization(),
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid", "read:organization"],
					postLogin: {
						page: "/select-organization",
						shouldRedirect,
						consentReferenceId: ({ session }) => {
							if (typeof session.activeOrganizationId !== "string") {
								throw new APIError("BAD_REQUEST", {
									message: "Select an organization",
								});
							}

							return session.activeOrganizationId;
						},
					},
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { auth, signInWithTestUser } = instance;
	const { headers } = await signInWithTestUser();
	const organizations = [];

	for (const slug of ["first", "second"]) {
		const organization = await auth.api.createOrganization({
			headers,
			body: { name: slug, slug, keepCurrentActiveOrganization: true },
		});
		if (!organization) throw new Error("Organization was not created");

		organizations.push(organization);
	}

	shouldRedirect.mockImplementation(
		async ({ session, headers, isContinuation }) => {
			const memberships = await auth.api.listOrganizations({ headers });
			const hasActiveOrganization = memberships.some(
				(organization) => organization.id === session.activeOrganizationId,
			);

			return (
				!hasActiveOrganization || (!isContinuation && memberships.length > 1)
			);
		},
	);

	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: { redirect_uris: [redirectURI] },
	});
	const query = new URLSearchParams({
		client_id: oauthClient.client_id,
		redirect_uri: redirectURI,
		response_type: "code",
		scope: "openid read:organization",
		state: "organization-selection",
		code_challenge: "a".repeat(43),
		code_challenge_method: "S256",
	});

	async function authorize(requestHeaders = headers) {
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/authorize?${query}`, {
				headers: requestHeaders,
			}),
		);
		return new URL(response.headers.get("location") ?? "", baseURL);
	}

	return { ...instance, headers, organizations, shouldRedirect, authorize };
}

/** @see https://github.com/better-auth/better-auth/issues/11093 */
describe("post-login organization selection", () => {
	it("continues to consent for a multi-organization user and asks again on a new grant", async () => {
		const { auth, client, headers, organizations, shouldRedirect, authorize } =
			await createPostLoginTestInstance();
		const selection = await authorize();

		expect(selection.pathname).toBe("/select-organization");
		expect(selection.searchParams.get(postLoginClearedParam)).toBeNull();

		await auth.api.setActiveOrganization({
			headers,
			body: { organizationId: organizations[1]!.id },
		});
		const continuation = await client.oauth2.continue({
			postLogin: true,
			oauth_query: selection.search.slice(1),
			fetchOptions: { headers, throw: true },
		});
		const consent = new URL(continuation.url, baseURL);

		expect(consent.pathname).toBe("/consent");
		expect(shouldRedirect).toHaveBeenLastCalledWith(
			expect.objectContaining({ isContinuation: true }),
		);

		const result = await client.oauth2.consent({
			accept: true,
			oauth_query: consent.search.slice(1),
			fetchOptions: { headers, throw: true },
		});
		const callback = new URL(result.url);

		expect(callback.origin + callback.pathname).toBe(redirectURI);
		expect(callback.searchParams.get("code")).toBeTruthy();
		expect(callback.searchParams.get("state")).toBe("organization-selection");
		const { adapter } = await auth.$context;
		const savedConsent = await adapter.findOne<{ referenceId: string }>({
			model: "oauthConsent",
			where: [{ field: "referenceId", value: organizations[1]!.id }],
		});
		expect(savedConsent?.referenceId).toBe(organizations[1]!.id);

		expect((await authorize()).pathname).toBe("/select-organization");
		expect(shouldRedirect).toHaveBeenLastCalledWith(
			expect.objectContaining({ isContinuation: false }),
		);
	});

	it("keeps the selection page when continuation has no selected organization", async () => {
		const { client, headers, authorize } = await createPostLoginTestInstance();
		const selection = await authorize();
		const continuation = await client.oauth2.continue({
			postLogin: true,
			oauth_query: selection.search.slice(1),
			fetchOptions: { headers, throw: true },
		});
		const redirect = new URL(continuation.url, baseURL);

		expect(redirect.pathname).toBe("/select-organization");
		expect(redirect.searchParams.get("code")).toBeNull();
		expect(redirect.searchParams.get(postLoginClearedParam)).toBeNull();
	});
});

describe.each([
	["undefined", undefined],
	["an empty string", ""],
])("consent without a reference (%s)", (_, noReference) => {
	async function createNoReferenceTestInstance() {
		const instance = await getTestInstance(
			{
				baseURL,
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						scopes: ["openid", "read", "write"],
						postLogin: {
							page: "/select-organization",
							shouldRedirect: () => false,
							consentReferenceId: () => noReference,
						},
					}),
				],
			},
			{ clientOptions: { plugins: [oauthProviderClient()] } },
		);
		const { auth, signInWithTestUser } = instance;
		const { headers, user } = await signInWithTestUser();
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [redirectURI] },
		});
		const { adapter } = await auth.$context;
		async function storeConsent(
			referenceId: string,
			scopes: string[],
			id?: string,
		) {
			await adapter.create({
				model: "oauthConsent",
				forceAllowId: id !== undefined,
				data: {
					...(id ? { id } : {}),
					clientId: oauthClient.client_id,
					userId: user.id,
					referenceId,
					scopes,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		}
		await storeConsent("org_1", ["read"]);

		async function authorize(scope: string) {
			const query = new URLSearchParams({
				client_id: oauthClient.client_id,
				redirect_uri: redirectURI,
				response_type: "code",
				scope,
				state: "no-reference",
				code_challenge: "a".repeat(43),
				code_challenge_method: "S256",
			});
			const response = await auth.handler(
				new Request(`${baseURL}/api/auth/oauth2/authorize?${query}`, {
					headers,
				}),
			);
			return new URL(response.headers.get("location") ?? "", baseURL);
		}

		async function findConsents() {
			return adapter.findMany<{
				referenceId?: string | null;
				scopes: string[];
			}>({
				model: "oauthConsent",
				where: [{ field: "clientId", value: oauthClient.client_id }],
			});
		}

		return { ...instance, headers, authorize, findConsents, storeConsent };
	}

	it("asks for consent instead of reusing another reference's consent", async () => {
		const { authorize } = await createNoReferenceTestInstance();
		const redirect = await authorize("read");

		expect(redirect.pathname).toBe("/consent");
		expect(redirect.searchParams.get("code")).toBeNull();
	});

	it("reuses consent saved with an empty reference", async () => {
		const { authorize, storeConsent } = await createNoReferenceTestInstance();
		await storeConsent("", ["read"]);
		const redirect = await authorize("read");

		expect(redirect.origin + redirect.pathname).toBe(redirectURI);
		expect(redirect.searchParams.get("code")).toBeTruthy();
	});

	it("finds consent without a reference past the first page of consents", async () => {
		const { authorize, storeConsent } = await createNoReferenceTestInstance();
		await Promise.all(
			Array.from({ length: 100 }, (_, i) => {
				const index = String(i).padStart(3, "0");
				return storeConsent(`org_${index}`, ["read"], `consent-${index}`);
			}),
		);
		await storeConsent("", ["read"], "consent-zzz");
		const redirect = await authorize("read");

		expect(redirect.origin + redirect.pathname).toBe(redirectURI);
		expect(redirect.searchParams.get("code")).toBeTruthy();
	});

	it("stores the approval without changing another reference's consent", async () => {
		const { client, headers, authorize, findConsents } =
			await createNoReferenceTestInstance();
		const consentPage = await authorize("read write");
		expect(consentPage.pathname).toBe("/consent");

		const result = await client.oauth2.consent({
			accept: true,
			oauth_query: consentPage.search.slice(1),
			fetchOptions: { headers, throw: true },
		});
		const callback = new URL(result.url);
		expect(callback.origin + callback.pathname).toBe(redirectURI);
		expect(callback.searchParams.get("code")).toBeTruthy();

		const consents = await findConsents();
		expect(consents).toHaveLength(2);
		expect(consents.find((c) => c.referenceId === "org_1")?.scopes).toEqual([
			"read",
		]);
		expect(consents.find((c) => !c.referenceId)?.scopes).toEqual([
			"read",
			"write",
		]);
	});
});

/**
 * The consent lookup and write, the member lookup, and the reference on the
 * issued token all go through the database adapter.
 */
describe.each(["sqlite", "postgres", "mongodb"] as const)(
	"consent bound to a named or chosen organization on %s",
	(testWith) => {
		type PostLogin = NonNullable<OAuthOptions<Scope[]>["postLogin"]>;

		async function createOrganizationConsentTestInstance() {
			const shouldRedirect = vi.fn<PostLogin["shouldRedirect"]>(() => false);
			const consentReferenceId = vi.fn<PostLogin["consentReferenceId"]>();
			const instance = await getTestInstance(
				{
					baseURL,
					plugins: [
						organization(),
						jwt(),
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							scopes: ["openid", "read:organization"],
							postLogin: {
								page: "/select-organization",
								shouldRedirect,
								consentReferenceId,
							},
						}),
					],
				},
				{
					testWith,
					// MongoDB keeps one database for every instance in this file.
					testUser: { email: `${generateRandomString(12)}@test.com` },
					clientOptions: { plugins: [oauthProviderClient()] },
				},
			);
			const { auth, client, signInWithTestUser, signInWithUser } = instance;
			const { headers, user } = await signInWithTestUser();
			const { adapter } = await auth.$context;

			consentReferenceId.mockImplementation(
				async ({ user, scopes, query, consent }) => {
					if (!scopes.includes("read:organization")) return undefined;
					const organizationId =
						query.get("organization") ?? consent?.referenceId;
					if (!organizationId) {
						if (!consent) return undefined;
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description: "Choose an organization",
						});
					}
					const member = await adapter.findOne({
						model: "member",
						where: [
							{ field: "organizationId", value: organizationId },
							{ field: "userId", value: user.id },
						],
					});
					if (!member) {
						throw new APIError("FORBIDDEN", {
							error: "access_denied",
							error_description: "Not a member of this organization",
						});
					}
					return organizationId;
				},
			);

			async function createOrganization(name: string, ownerHeaders: Headers) {
				const slug = `${name}-${generateRandomString(8, "a-z")}`;
				const organization = await auth.api.createOrganization({
					headers: ownerHeaders,
					body: { name, slug, keepCurrentActiveOrganization: true },
				});
				if (!organization) throw new Error("Organization was not created");
				return organization.id;
			}
			const first = await createOrganization("first", headers);
			const second = await createOrganization("second", headers);
			const outsiderEmail = `${generateRandomString(12)}@test.com`;
			await auth.api.signUpEmail({
				body: {
					email: outsiderEmail,
					password: "outsider-password",
					name: "Outsider",
				},
			});
			const outsider = await signInWithUser(outsiderEmail, "outsider-password");
			const notMine = await createOrganization("not-mine", outsider.headers);

			const oauthClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectURI],
					token_endpoint_auth_method: "client_secret_post",
				},
			});
			const codeVerifier = generateRandomString(43, "a-z", "A-Z", "0-9");
			const codeChallenge = base64url.encode(
				new Uint8Array(
					await crypto.subtle.digest(
						"SHA-256",
						new TextEncoder().encode(codeVerifier),
					),
				),
			);

			async function authorize(scope: string, organizationId?: string) {
				const query = new URLSearchParams({
					client_id: oauthClient.client_id,
					redirect_uri: redirectURI,
					response_type: "code",
					scope,
					state: "organization-consent",
					code_challenge: codeChallenge,
					code_challenge_method: "S256",
				});
				if (organizationId) query.set("organization", organizationId);
				const response = await auth.handler(
					new Request(`${baseURL}/api/auth/oauth2/authorize?${query}`, {
						headers,
					}),
				);
				return new URL(response.headers.get("location") ?? "", baseURL);
			}

			function accept(consentPage: URL, referenceId?: string) {
				return client.oauth2.consent({
					accept: true,
					reference_id: referenceId,
					oauth_query: consentPage.search.slice(1),
					fetchOptions: { headers },
				});
			}

			/** Redeems the code and returns the reference its access token carries. */
			async function tokenReference(callback: string) {
				const code = new URL(callback).searchParams.get("code");
				if (!code) throw new Error("authorization code not issued");
				const tokenHeaders = {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				};
				const tokens = await client.$fetch<{ access_token: string }>(
					"/oauth2/token",
					{
						method: "POST",
						headers: tokenHeaders,
						body: new URLSearchParams({
							grant_type: "authorization_code",
							code,
							code_verifier: codeVerifier,
							redirect_uri: redirectURI,
							client_id: oauthClient.client_id,
							client_secret: oauthClient.client_secret!,
						}),
					},
				);
				if (!tokens.data) throw new Error("access token not issued");
				const introspection = await client.oauth2.introspect(
					{
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret,
						token: tokens.data.access_token,
						token_type_hint: "access_token",
					},
					{ headers: tokenHeaders },
				);
				return introspection.data?.reference_id;
			}

			async function findConsents() {
				return adapter.findMany<{ referenceId?: string | null }>({
					model: "oauthConsent",
					where: [{ field: "userId", value: user.id }],
				});
			}

			return {
				first,
				second,
				notMine,
				shouldRedirect,
				consentReferenceId,
				authorize,
				accept,
				tokenReference,
				findConsents,
			};
		}

		it("binds consent to the organization the authorization request names", async () => {
			const {
				first,
				second,
				shouldRedirect,
				authorize,
				accept,
				tokenReference,
				findConsents,
			} = await createOrganizationConsentTestInstance();
			const consentPage = await authorize("openid read:organization", second);

			expect(consentPage.pathname).toBe("/consent");
			expect(shouldRedirect.mock.lastCall?.[0].query.get("organization")).toBe(
				second,
			);

			const result = await accept(consentPage);
			if (!result.data) throw new Error("consent was refused");

			expect(await tokenReference(result.data.url)).toBe(second);
			expect((await findConsents()).map((c) => c.referenceId)).toEqual([
				second,
			]);
			const reused = await authorize("openid read:organization", second);
			expect(reused.origin + reused.pathname).toBe(redirectURI);
			expect(reused.searchParams.get("code")).toBeTruthy();
			expect(
				(await authorize("openid read:organization", first)).pathname,
			).toBe("/consent");
		});

		it("stores the organization the user chooses on the consent page", async () => {
			const {
				first,
				consentReferenceId,
				authorize,
				accept,
				tokenReference,
				findConsents,
			} = await createOrganizationConsentTestInstance();
			const consentPage = await authorize("openid read:organization");

			expect(consentPage.pathname).toBe("/consent");
			expect(consentReferenceId.mock.lastCall?.[0].consent).toBeUndefined();

			consentReferenceId.mockClear();
			const result = await accept(consentPage, first);
			if (!result.data) throw new Error("consent was refused");

			expect(consentReferenceId).toHaveBeenCalledOnce();
			const [{ consent, query }] = consentReferenceId.mock.lastCall!;
			expect(consent).toEqual({ referenceId: first });
			expect(query.get("client_id")).toBeTruthy();
			expect(query.has("sig")).toBe(false);
			expect(query.has("ba_param")).toBe(false);
			expect(await tokenReference(result.data.url)).toBe(first);
			expect((await findConsents()).map((c) => c.referenceId)).toEqual([first]);
		});

		it("refuses an organization the user does not belong to", async () => {
			const { notMine, authorize, accept, findConsents } =
				await createOrganizationConsentTestInstance();
			const consentPage = await authorize("openid read:organization");
			const result = await accept(consentPage, notMine);

			expect(result.data).toBeNull();
			expect(result.error?.status).toBe(403);
			expect(result.error).toMatchObject({ error: "access_denied" });
			expect(await findConsents()).toEqual([]);
		});

		it("stores consent without a reference when the request needs none", async () => {
			const { consentReferenceId, authorize, accept, findConsents } =
				await createOrganizationConsentTestInstance();
			const consentPage = await authorize("openid");
			const result = await accept(consentPage);
			if (!result.data) throw new Error("consent was refused");
			const callback = new URL(result.data.url);

			expect(callback.origin + callback.pathname).toBe(redirectURI);
			expect(callback.searchParams.get("code")).toBeTruthy();
			expect(consentReferenceId).toHaveBeenLastCalledWith(
				expect.objectContaining({ consent: { referenceId: undefined } }),
			);
			const consents = await findConsents();
			expect(consents).toHaveLength(1);
			expect(consents[0]?.referenceId ?? undefined).toBeUndefined();
		});
	},
);

it("rejects a chosen reference when no callback can verify it", async () => {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid"],
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: { redirect_uris: [redirectURI] },
	});
	const query = new URLSearchParams({
		client_id: oauthClient.client_id,
		redirect_uri: redirectURI,
		response_type: "code",
		scope: "openid",
		code_challenge: "a".repeat(43),
		code_challenge_method: "S256",
	});
	const response = await auth.handler(
		new Request(`${baseURL}/api/auth/oauth2/authorize?${query}`, { headers }),
	);
	const consentPage = new URL(response.headers.get("location") ?? "", baseURL);
	const result = await client.oauth2.consent({
		accept: true,
		reference_id: "org_1",
		oauth_query: consentPage.search.slice(1),
		fetchOptions: { headers },
	});

	expect(result.error?.status).toBe(400);
	expect(result.error).toMatchObject({ error: "invalid_request" });
});
