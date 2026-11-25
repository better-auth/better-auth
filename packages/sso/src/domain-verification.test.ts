import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import type { SecondaryStorage } from "better-auth/db";
import { getMigrations } from "better-auth/db/migration";
import { bearer, organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { Kysely } from "kysely";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";
import type { SSOOptions } from "./types";

const dnsMock = vi.hoisted(() => {
	return {
		resolveTxt: vi.fn(),
	};
});

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

vi.mock("node:dns/promises", () => {
	return {
		...dnsMock,
		default: dnsMock,
	};
});

describe("Domain verification", async () => {
	type TestUser = { email: string; password: string; name: string };
	const testUser: TestUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	const createTestAuth = (
		options?: SSOOptions,
		betterAuthOptions?: {
			secondaryStorage?: SecondaryStorage;
		},
	) => {
		const data: Record<string, any[]> = {
			user: [],
			session: [],
			account: [],
			ssoProvider: [],
			member: [],
			organization: [],
		};

		if (!betterAuthOptions?.secondaryStorage) {
			data.verification = [];
		}

		const memory = memoryAdapter(data);

		const ssoOptions = {
			...options,
			domainVerification: {
				...options?.domainVerification,
				enabled: true,
			},
		} satisfies SSOOptions;

		const auth = betterAuth({
			database: memory,
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: true,
			},
			secondaryStorage: betterAuthOptions?.secondaryStorage,
			plugins: [sso(ssoOptions), organization()],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [bearer(), ssoClient({ domainVerification: { enabled: true } })],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		async function createOrganization(name: string, headers: Headers) {
			return await auth.api.createOrganization({
				body: {
					name,
					slug: name,
				},
				headers,
			});
		}

		async function getAuthHeaders(user: TestUser, organizationId?: string) {
			const headers = new Headers();
			const response = await authClient.signUp.email({
				email: user.email,
				password: user.password,
				name: user.name,
			});

			if (response.data && organizationId) {
				await auth.api.addMember({
					body: {
						userId: response.data.user.id,
						role: "member",
						organizationId,
					},
					headers,
				});
			}

			await authClient.signIn.email(user, {
				throw: true,
				onSuccess: setCookieToHeader(headers),
			});

			return headers;
		}

		async function registerSSOProvider(
			headers: Headers,
			organizationId?: string,
		) {
			return auth.api.registerSSOProvider({
				body: {
					providerId: "saml-provider-1",
					issuer: "http://hello.com:8081",
					domain: "http://hello.com:8081",
					samlConfig: {
						entryPoint: "http://idp.com:",
						cert: "the-cert",
						idpMetadata: { entityID: "http://idp.com" },
						spMetadata: {},
					},
					organizationId,
				},
				headers,
			});
		}

		return {
			auth,
			authClient,
			registerSSOProvider,
			getAuthHeaders,
			createOrganization,
		};
	};

	afterEach(() => {
		vi.useRealTimers();
		dnsMock.resolveTxt.mockReset();
	});

	describe("POST /sso/request-domain-verification", () => {
		it("should return unauthorized when session is missing", async () => {
			const { auth } = createTestAuth();
			const response = await auth.api.requestDomainVerification({
				body: {
					providerId: "the-provider",
				},
				asResponse: true,
			});

			expect(response.status).toBe(401);
		});

		it("should return not found when no provider is found", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const response = await auth.api.requestDomainVerification({
				body: {
					providerId: "unknown",
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({
				message: "Provider not found",
			});
		});

		it("should return the existing active verification token", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			vi.useFakeTimers({ toFake: ["Date"] });

			const newAuthHeaders = await getAuthHeaders(testUser);

			const response = await auth.api.requestDomainVerification({
				body: {
					providerId: provider.providerId,
				},
				headers: newAuthHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(201);
			expect(await response.json()).toEqual({
				domainVerificationToken: provider.domainVerificationToken,
			});
		});

		it("should return forbidden if user does not own the provider", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			const notOwnerHeaders = await getAuthHeaders({
				name: "other",
				email: "other@test.com",
				password: "password",
			});
			const response = await auth.api.requestDomainVerification({
				body: {
					providerId: provider.providerId,
				},
				headers: notOwnerHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({
				message: "You don't have access to this provider",
			});
		});

		it("should return forbidden if user does not belong to the provider organization", async () => {
			const { auth, getAuthHeaders, registerSSOProvider, createOrganization } =
				createTestAuth();
			const headers = await getAuthHeaders(testUser);

			const orgA = await createOrganization("org-a", headers);
			const orgB = await createOrganization("org-b", headers);

			const provider = await registerSSOProvider(headers, orgA?.id);

			const notOrgHeaders = await getAuthHeaders(
				{
					name: "other",
					email: "other@test.com",
					password: "password",
				},
				orgB?.id,
			);

			const response = await auth.api.requestDomainVerification({
				body: {
					providerId: provider.providerId,
				},
				headers: notOrgHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({
				message: "You don't have access to this provider",
			});
		});

		it("should return a new domain verification token", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			vi.useFakeTimers({ toFake: ["Date"] });
			vi.advanceTimersByTime(Date.now() + 3600 * 24 * 7 * 1000 + 10); // advance 1 week + 10 seconds

			const newHeaders = await getAuthHeaders(testUser);
			const response = await auth.api.requestDomainVerification({
				body: {
					providerId: provider.providerId,
				},
				headers: newHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(201);
			expect(await response.json()).toMatchObject({
				domainVerificationToken: expect.any(String),
			});
		});

		it("allows a non-creator org admin to request verification for an org-owned provider", async () => {
			const { auth, getAuthHeaders, registerSSOProvider, createOrganization } =
				createTestAuth();
			const ownerHeaders = await getAuthHeaders(testUser);
			const org = await createOrganization("org-with-admin", ownerHeaders);

			// The org owner registers the provider; a different org admin who did
			// not create it must still be able to verify its domain.
			const provider = await registerSSOProvider(ownerHeaders, org?.id);

			const adminHeaders = await getAuthHeaders({
				name: "Org Admin",
				email: "org-admin@test.com",
				password: "password",
			});
			const adminSession = await auth.api.getSession({ headers: adminHeaders });
			await auth.api.addMember({
				body: {
					userId: adminSession!.user.id,
					role: "admin",
					organizationId: org!.id,
				},
				headers: ownerHeaders,
			});

			const response = await auth.api.requestDomainVerification({
				body: { providerId: provider.providerId },
				headers: adminHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(201);
			expect(await response.json()).toMatchObject({
				domainVerificationToken: expect.any(String),
			});
		});

		it("should fail to create a new token on an already verified domain", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			dnsMock.resolveTxt.mockResolvedValue([
				[
					`_better-auth-token-saml-provider-1=${provider.domainVerificationToken}`,
				],
			]);

			const domainVerificationResponse = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});

			expect(domainVerificationResponse.status).toBe(204);

			const domainVerificationSubmissionResponse =
				await auth.api.requestDomainVerification({
					body: {
						providerId: provider.providerId,
					},
					headers,
					asResponse: true,
				});

			expect(domainVerificationSubmissionResponse.status).toBe(409);
			expect(await domainVerificationSubmissionResponse.json()).toEqual({
				message: "Domain has already been verified",
				code: "DOMAIN_VERIFIED",
			});
		});
	});

	describe("POST /sso/verify-domain", () => {
		it("should return unauthorized when session is missing", async () => {
			const { auth } = createTestAuth();
			const response = await auth.api.verifyDomain({
				body: {
					providerId: "the-provider",
				},
				asResponse: true,
			});

			expect(response.status).toBe(401);
		});

		it("should return not found when no provider is found", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const response = await auth.api.verifyDomain({
				body: {
					providerId: "unknown",
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({
				message: "Provider not found",
			});
		});

		it("should return not found when no pending verification is found", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			vi.useFakeTimers({ toFake: ["Date"] });
			vi.advanceTimersByTime(Date.now() + 3600 * 24 * 7 * 1000 + 10); // advance 1 week + 10 seconds

			const newAuthHeaders = await getAuthHeaders(testUser);

			const response = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers: newAuthHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({
				message: "No pending domain verification exists",
				code: "NO_PENDING_VERIFICATION",
			});
		});

		it("should return bad gateway when unable to verify domain", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			dnsMock.resolveTxt.mockResolvedValue([
				["google-site-verification=the-token"],
			]);

			const response = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(502);
			expect(await response.json()).toEqual({
				message:
					"Unable to verify domain ownership for hello.com. Try again later",
				code: "DOMAIN_VERIFICATION_FAILED",
			});
		});

		it("should return bad gateway when the TXT record only contains the verification token as a substring", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			dnsMock.resolveTxt.mockResolvedValue([
				[`prefix-${provider.domainVerificationToken}-suffix`],
				[
					`_better-auth-token-saml-provider-1=${provider.domainVerificationToken}-suffix`,
				],
			]);

			const response = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(502);
			expect(await response.json()).toEqual({
				message:
					"Unable to verify domain ownership for hello.com. Try again later",
				code: "DOMAIN_VERIFICATION_FAILED",
			});
		});

		it("should return forbidden if user does not own the provider", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			const notOwnerHeaders = await getAuthHeaders({
				name: "other",
				email: "other@test.com",
				password: "password",
			});
			const response = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers: notOwnerHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({
				message: "You don't have access to this provider",
			});
		});

		it("should return forbidden if user does not belong to the provider organization", async () => {
			const { auth, getAuthHeaders, registerSSOProvider, createOrganization } =
				createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const orgA = await createOrganization("org-a", headers);
			const orgB = await createOrganization("org-b", headers);

			const provider = await registerSSOProvider(headers, orgA?.id);

			const notOrgHeaders = await getAuthHeaders(
				{
					name: "other",
					email: "other@test.com",
					password: "password",
				},
				orgB?.id,
			);
			const response = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers: notOrgHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({
				message: "You don't have access to this provider",
			});
		});

		it("should verify a provider domain ownership", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			expect(provider.domain).toBe("http://hello.com:8081");
			expect(provider.domainVerified).toBe(false);
			expect(provider.domainVerificationToken).toBeTypeOf("string");

			dnsMock.resolveTxt.mockResolvedValue([
				["google-site-verification=the-token"],
				[
					"v=spf1 ip4:50.242.118.232/29 include:_spf.google.com include:mail.zendesk.com ~all",
				],
				[
					"_better-auth-token-saml-provider-1=",
					provider.domainVerificationToken,
				],
			]);

			const response = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(204);
			expect(dnsMock.resolveTxt).toHaveBeenCalledWith(
				"_better-auth-token-saml-provider-1.hello.com",
			);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-8c5h-wx78-2cfg
		 */
		it("rejects a stale proof after a domain update with the memory adapter", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			const dnsStarted = createDeferred<void>();
			const dnsCompletion = createDeferred<string[][]>();
			dnsMock.resolveTxt.mockImplementation(async () => {
				dnsStarted.resolve();
				return dnsCompletion.promise;
			});

			const verificationPromise = auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});
			await dnsStarted.promise;

			const updateResponse = await auth.api.updateSSOProvider({
				body: {
					providerId: provider.providerId,
					domain: "changed.example",
				},
				headers,
				asResponse: true,
			});
			expect(updateResponse.status).toBe(200);

			dnsCompletion.resolve([[provider.domainVerificationToken]]);
			const verificationResponse = await verificationPromise;
			expect(verificationResponse.status).toBe(409);
			expect(await verificationResponse.json()).toEqual({
				code: "SSO_PROVIDER_CHANGED",
				message:
					"SSO provider changed while domain verification was in progress. Reload the provider and try again",
			});

			const persistedProvider = await auth.api.getSSOProvider({
				query: { providerId: provider.providerId },
				headers,
			});
			expect(persistedProvider).toMatchObject({
				domain: "changed.example",
				domainVerified: false,
			});
		});

		/**
		 * `domainVerified` only joins the schema once `domainVerification` is
		 * enabled, so providers registered before that have no stored value for the
		 * bit. Enabling the option later must not strand them.
		 *
		 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-8c5h-wx78-2cfg
		 */
		it("verifies a provider registered before domain verification was enabled", async () => {
			const db = {
				user: [] as Record<string, unknown>[],
				session: [] as Record<string, unknown>[],
				account: [] as Record<string, unknown>[],
				verification: [] as Record<string, unknown>[],
				ssoProvider: [] as Record<string, unknown>[],
			};
			const buildAuth = (domainVerificationEnabled: boolean) =>
				betterAuth({
					database: memoryAdapter(db),
					baseURL: "http://localhost:3000",
					emailAndPassword: { enabled: true },
					plugins: [
						sso(
							domainVerificationEnabled
								? { domainVerification: { enabled: true } }
								: {},
						),
					],
				});
			const signIn = async (
				auth: ReturnType<typeof buildAuth>,
				options: { register?: boolean } = {},
			) => {
				const client = createAuthClient({
					baseURL: "http://localhost:3000",
					plugins: [bearer()],
					fetchOptions: {
						customFetchImpl: async (url, init) =>
							auth.handler(new Request(url, init)),
					},
				});
				if (options.register) {
					await client.signUp.email(testUser);
				}
				const headers = new Headers();
				await client.signIn.email(testUser, {
					throw: true,
					onSuccess: setCookieToHeader(headers),
				});
				return headers;
			};

			const legacyAuth = buildAuth(false);
			await legacyAuth.api.registerSSOProvider({
				body: {
					providerId: "pre-upgrade-provider",
					issuer: "http://hello.com:8081",
					domain: "http://hello.com:8081",
					samlConfig: {
						entryPoint: "http://idp.com:",
						cert: "the-cert",
						callbackUrl: "http://hello.com:8081/api/sso/saml2/callback",
						idpMetadata: { entityID: "http://idp.com" },
						spMetadata: {},
					},
				},
				headers: await signIn(legacyAuth, { register: true }),
			});
			// Precondition: the column is absent, so the bit was never stored.
			expect(db.ssoProvider[0]).not.toHaveProperty("domainVerified");

			const auth = buildAuth(true);
			const headers = await signIn(auth);
			const { domainVerificationToken } =
				await auth.api.requestDomainVerification({
					body: { providerId: "pre-upgrade-provider" },
					headers,
				});
			dnsMock.resolveTxt.mockResolvedValue([[domainVerificationToken]]);

			const response = await auth.api.verifyDomain({
				body: { providerId: "pre-upgrade-provider" },
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(204);
			const persistedProvider = await auth.api.getSSOProvider({
				query: { providerId: "pre-upgrade-provider" },
				headers,
			});
			expect(persistedProvider).toMatchObject({ domainVerified: true });
		});

		it("should verify a provider domain ownership (custom token verification prefix)", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth({
				domainVerification: { tokenPrefix: "auth-prefix" },
			});
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			dnsMock.resolveTxt.mockResolvedValue([
				["google-site-verification=the-token"],
				[
					"v=spf1 ip4:50.242.118.232/29 include:_spf.google.com include:mail.zendesk.com ~all",
				],
				[`_auth-prefix-saml-provider-1=${provider.domainVerificationToken}`],
			]);

			const response = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(204);
			expect(dnsMock.resolveTxt).toHaveBeenCalledWith(
				"_auth-prefix-saml-provider-1.hello.com",
			);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/8361
		 */
		it("should verify a provider domain ownership with a bare domain", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders(testUser);

			await auth.api.registerSSOProvider({
				body: {
					providerId: "bare-domain-provider",
					issuer: "http://hello.com:8081",
					domain: "hello.com",
					samlConfig: {
						entryPoint: "http://idp.com:",
						cert: "the-cert",
						idpMetadata: { entityID: "http://idp.com" },
						spMetadata: {},
					},
				},
				headers,
			});

			const requestResponse = await auth.api.requestDomainVerification({
				body: { providerId: "bare-domain-provider" },
				headers,
				asResponse: true,
			});

			expect(requestResponse.status).toBe(201);
			const { domainVerificationToken } = await requestResponse.json();

			dnsMock.resolveTxt.mockResolvedValue([
				[`_better-auth-token-bare-domain-provider=${domainVerificationToken}`],
			]);

			const verifyResponse = await auth.api.verifyDomain({
				body: { providerId: "bare-domain-provider" },
				headers,
				asResponse: true,
			});

			expect(verifyResponse.status).toBe(204);
			expect(dnsMock.resolveTxt).toHaveBeenCalledWith(
				"_better-auth-token-bare-domain-provider.hello.com",
			);
		});

		it("should return bad request when provider ID exceeds DNS label limit", async () => {
			const longProviderId = "a".repeat(50);
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders(testUser);

			await auth.api.registerSSOProvider({
				body: {
					providerId: longProviderId,
					issuer: "http://hello.com:8081",
					domain: "http://hello.com:8081",
					samlConfig: {
						entryPoint: "http://idp.com:",
						cert: "the-cert",
						idpMetadata: { entityID: "http://idp.com" },
						spMetadata: {},
					},
				},
				headers,
			});

			const response = await auth.api.verifyDomain({
				body: {
					providerId: longProviderId,
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				message:
					"Verification identifier exceeds the DNS label limit of 63 characters",
				code: "IDENTIFIER_TOO_LONG",
			});
		});

		it("should fail to verify an already verified domain", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			dnsMock.resolveTxt.mockResolvedValue([
				[
					`_better-auth-token-saml-provider-1=${provider.domainVerificationToken}`,
				],
			]);

			const firstResponse = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});

			expect(firstResponse.status).toBe(204);

			const secondResponse = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});

			expect(secondResponse.status).toBe(409);
			expect(await secondResponse.json()).toEqual({
				message: "Domain has already been verified",
				code: "DOMAIN_VERIFIED",
			});
		});

		it("does not verify a URL-like multi-domain provider unless every later-accepted domain is owned", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders(testUser);

			await auth.api.registerSSOProvider({
				body: {
					providerId: "multi-domain-provider",
					issuer: "https://idp.example.com",
					// The URL-like first entry exercises the shared normalization used
					// by both verification and later domain matching.
					domain: "https://attacker.com/path,victim.com",
					samlConfig: {
						entryPoint: "http://idp.com:",
						cert: "the-cert",
						idpMetadata: { entityID: "https://idp.example.com" },
						callbackUrl: "http://hello.com:8081/api/sso/saml2/callback",
						spMetadata: {},
					},
				},
				headers,
			});

			const requestResponse = await auth.api.requestDomainVerification({
				body: { providerId: "multi-domain-provider" },
				headers,
				asResponse: true,
			});
			const { domainVerificationToken } = await requestResponse.json();

			// Only attacker.com publishes the verifying record; victim.com does not.
			dnsMock.resolveTxt.mockImplementation(async (name: string) => {
				if (name === "_better-auth-token-multi-domain-provider.attacker.com") {
					return [
						[
							`_better-auth-token-multi-domain-provider=${domainVerificationToken}`,
						],
					];
				}
				return [];
			});

			const verifyResponse = await auth.api.verifyDomain({
				body: { providerId: "multi-domain-provider" },
				headers,
				asResponse: true,
			});

			// victim.com ownership was never proven, so the provider must not verify.
			expect(verifyResponse.status).toBe(502);
			expect(await verifyResponse.json()).toEqual({
				message:
					"Unable to verify domain ownership for victim.com. Try again later",
				code: "DOMAIN_VERIFICATION_FAILED",
			});
			expect(dnsMock.resolveTxt).toHaveBeenCalledWith(
				"_better-auth-token-multi-domain-provider.victim.com",
			);
		});

		it("verifies a multi-domain provider when every listed domain is owned", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders(testUser);

			await auth.api.registerSSOProvider({
				body: {
					providerId: "owned-multi-domain",
					issuer: "https://idp.company.example",
					domain: "company.com,subsidiary.com",
					samlConfig: {
						entryPoint: "http://idp.com:",
						cert: "the-cert",
						idpMetadata: { entityID: "https://idp.company.example" },
						callbackUrl: "http://hello.com:8081/api/sso/saml2/callback",
						spMetadata: {},
					},
				},
				headers,
			});

			const requestResponse = await auth.api.requestDomainVerification({
				body: { providerId: "owned-multi-domain" },
				headers,
				asResponse: true,
			});
			const { domainVerificationToken } = await requestResponse.json();

			// Both listed domains publish the verifying record.
			dnsMock.resolveTxt.mockResolvedValue([[domainVerificationToken]]);

			const verifyResponse = await auth.api.verifyDomain({
				body: { providerId: "owned-multi-domain" },
				headers,
				asResponse: true,
			});

			expect(verifyResponse.status).toBe(204);
			expect(dnsMock.resolveTxt).toHaveBeenCalledWith(
				"_better-auth-token-owned-multi-domain.company.com",
			);
			expect(dnsMock.resolveTxt).toHaveBeenCalledWith(
				"_better-auth-token-owned-multi-domain.subsidiary.com",
			);
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8348
	 */
	describe("with secondaryStorage (no storeInDatabase)", () => {
		it("should request and verify domain verification via secondary storage", async () => {
			const store = new Map<string, string>();
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth(
				undefined,
				{
					secondaryStorage: {
						set(key, value, ttl) {
							store.set(key, value);
						},
						get(key) {
							return store.get(key) || null;
						},
						getAndDelete(key) {
							const value = store.get(key) || null;
							store.delete(key);
							return value;
						},
						increment(key) {
							const count = Number(store.get(key) ?? 0) + 1;
							store.set(key, String(count));
							return count;
						},
						delete(key) {
							store.delete(key);
						},
					},
				},
			);

			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			expect(provider.domainVerificationToken).toBeTypeOf("string");

			// Re-request should return the existing token from secondary storage
			const response = await auth.api.requestDomainVerification({
				body: { providerId: provider.providerId },
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(201);
			expect(await response.json()).toEqual({
				domainVerificationToken: provider.domainVerificationToken,
			});

			// Verify domain via DNS
			dnsMock.resolveTxt.mockResolvedValue([
				[
					`_better-auth-token-saml-provider-1=${provider.domainVerificationToken}`,
				],
			]);

			const verifyResponse = await auth.api.verifyDomain({
				body: { providerId: provider.providerId },
				headers,
				asResponse: true,
			});

			expect(verifyResponse.status).toBe(204);
		});
	});
});

/**
 * @see https://better-auth.com/docs/concepts/database#database-hooks
 */
describe("domain verification tokens vetoed by a verification hook", () => {
	const veto = { active: false };
	const afterCreate = { fail: false };
	const databaseHooks: BetterAuthOptions["databaseHooks"] = {
		verification: {
			create: {
				async before() {
					return veto.active ? false : undefined;
				},
				async after() {
					if (afterCreate.fail) throw new Error("after hook failed");
				},
			},
		},
	};

	afterEach(() => {
		veto.active = false;
		afterCreate.fail = false;
	});

	/**
	 * With `transaction: false`, registration uses a SQLite database whose
	 * adapter is configured without transactions.
	 */
	async function setup({ transaction = true } = {}) {
		const plugins = [sso({ domainVerification: { enabled: true } })];
		const database = transaction
			? undefined
			: {
					db: new Kysely({
						dialect: new NodeSqliteDialect({
							database: new DatabaseSync(":memory:"),
						}),
					}),
					type: "sqlite" as const,
					transaction: false,
				};
		if (database) {
			onTestFinished(() => database.db.destroy());
			const migrations = await getMigrations({ database, plugins });
			await migrations.runMigrations();
		}
		const { auth, signInWithTestUser } = await getTestInstance({
			...(database ? { database } : {}),
			databaseHooks,
			plugins,
		});
		const { headers } = await signInWithTestUser();
		const register = () =>
			auth.api.registerSSOProvider({
				body: {
					providerId: "vetoed-domain-provider",
					issuer: "https://idp.vetoed-domain.com",
					domain: "vetoed-domain.com",
					samlConfig: {
						entryPoint: "https://idp.vetoed-domain.com/sso",
						cert: "the-cert",
						idpMetadata: { entityID: "https://idp.vetoed-domain.com" },
						spMetadata: {},
					},
				},
				headers,
				asResponse: true,
			});
		const providers = async () =>
			(await auth.$context).adapter.findMany({ model: "ssoProvider" });
		return { auth, headers, register, providers };
	}

	it.for([true, false])(
		"does not register a provider whose token was not stored (transaction: %s)",
		async (transaction) => {
			const { register, providers } = await setup({ transaction });
			veto.active = true;

			const res = await register();

			expect(res.status).toBe(500);
			expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
			expect(await providers()).toEqual([]);
			veto.active = false;
			const retry = await register();
			expect(retry.status).toBe(200);
			expect((await retry.json()).domainVerificationToken).toEqual(
				expect.any(String),
			);
		},
	);

	it.for([true, false])(
		"keeps a stored provider and token when an after hook fails (transaction: %s)",
		async (transaction) => {
			const { auth, register, providers } = await setup({ transaction });
			afterCreate.fail = true;

			await expect(register()).rejects.toThrow("after hook failed");

			expect(await providers()).toHaveLength(1);
			const token = await (
				await auth.$context
			).internalAdapter.findVerificationValue(
				"_better-auth-token-vetoed-domain-provider",
			);

			expect(token).not.toBeNull();
		},
	);

	/**
	 * Without AsyncLocalStorage, as on runtimes that lack it, queued after hooks
	 * run inline as each write completes instead of after the callback returns.
	 */
	it("keeps a stored provider and token when an after hook fails without AsyncLocalStorage", async () => {
		const { auth, register, providers } = await setup();
		const globalContext = (
			globalThis as { [key: symbol]: { context: object } | undefined }
		)[Symbol.for("better-auth:global")]!.context;
		const previous = Object.getOwnPropertyDescriptor(
			globalContext,
			"adapterAsyncStorage",
		);
		Object.defineProperty(globalContext, "adapterAsyncStorage", {
			configurable: true,
			get() {
				throw new Error("AsyncLocalStorage is unavailable");
			},
		});
		onTestFinished(() => {
			if (previous) {
				Object.defineProperty(globalContext, "adapterAsyncStorage", previous);
			} else {
				Reflect.deleteProperty(globalContext, "adapterAsyncStorage");
			}
		});
		afterCreate.fail = true;

		await expect(register()).rejects.toThrow("after hook failed");

		expect(await providers()).toHaveLength(1);
		const token = await (
			await auth.$context
		).internalAdapter.findVerificationValue(
			"_better-auth-token-vetoed-domain-provider",
		);
		expect(token).not.toBeNull();
	});

	it("removes the provider on a veto even when the token lookup fails", async () => {
		const { auth, register, providers } = await setup();
		const ctx = await auth.$context;
		vi.spyOn(ctx.internalAdapter, "findVerificationValue").mockRejectedValue(
			new Error("lookup failed"),
		);
		veto.active = true;

		const res = await register();

		expect(res.status).toBe(500);
		expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
		vi.restoreAllMocks();
		expect(await providers()).toEqual([]);
	});

	it("removes both records when an after hook fails and the token lookup fails", async () => {
		const { auth, register, providers } = await setup();
		const ctx = await auth.$context;
		const findVerificationValue = ctx.internalAdapter.findVerificationValue;
		const lookup = vi
			.spyOn(ctx.internalAdapter, "findVerificationValue")
			.mockRejectedValue(new Error("lookup failed"));
		afterCreate.fail = true;

		await expect(register()).rejects.toThrow("after hook failed");

		lookup.mockRestore();
		expect(await providers()).toEqual([]);
		expect(
			await findVerificationValue("_better-auth-token-vetoed-domain-provider"),
		).toBeNull();
	});

	it("does not return a requested token that was not stored", async () => {
		const { auth, headers, register } = await setup();
		expect((await register()).status).toBe(200);
		const ctx = await auth.$context;
		await ctx.internalAdapter.deleteVerificationByIdentifier(
			"_better-auth-token-vetoed-domain-provider",
		);
		veto.active = true;

		const res = await auth.api.requestDomainVerification({
			body: { providerId: "vetoed-domain-provider" },
			headers,
			asResponse: true,
		});

		expect(res.status).toBe(500);
		expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
	});
});
