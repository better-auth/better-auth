import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer, organization } from "better-auth/plugins";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";
import type { SSOOptions } from "./types";

const dnsMock = vi.hoisted(() => {
	return {
		resolveTxt: vi.fn(),
	};
});

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

	const createTestAuth = (options?: SSOOptions) => {
		const data = {
			user: [],
			session: [],
			verification: [],
			account: [],
			ssoProvider: [],
			member: [],
			organization: [],
		};

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
						callbackUrl: "http://hello.com:8081/api/sso/saml2/callback",
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
		vi.clearAllMocks();
		vi.useRealTimers();
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
				code: "PROVIDER_NOT_FOUND",
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
				message:
					"User must be owner of or belong to the SSO provider organization",
				code: "INSUFICCIENT_ACCESS",
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
				message:
					"User must be owner of or belong to the SSO provider organization",
				code: "INSUFICCIENT_ACCESS",
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

		it("should fail to create a new token on an already verified domain", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			dnsMock.resolveTxt.mockResolvedValue([
				[
					`better-auth-token-saml-provider-1=${provider.domainVerificationToken}`,
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
				code: "PROVIDER_NOT_FOUND",
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
				message: "Unable to verify domain ownership. Try again later",
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
				message:
					"User must be owner of or belong to the SSO provider organization",
				code: "INSUFICCIENT_ACCESS",
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
				message:
					"User must be owner of or belong to the SSO provider organization",
				code: "INSUFICCIENT_ACCESS",
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
					`better-auth-token-saml-provider-1=${provider.domainVerificationToken}`,
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
				[`auth-prefix-saml-provider-1=${provider.domainVerificationToken}`],
			]);

			const response = await auth.api.verifyDomain({
				body: {
					providerId: provider.providerId,
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(204);
		});

		it("should fail to verify an already verified domain", async () => {
			const { auth, getAuthHeaders, registerSSOProvider } = createTestAuth();
			const headers = await getAuthHeaders(testUser);
			const provider = await registerSSOProvider(headers);

			dnsMock.resolveTxt.mockResolvedValue([
				[
					`better-auth-token-saml-provider-1=${provider.domainVerificationToken}`,
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
	});
});
