import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

const TEST_CERT = `MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0Gcm9markup
temporary cert for testing`;

describe("SSO provider read endpoints", () => {
	type TestUser = { email: string; password: string; name: string };

	interface SSOProviderData {
		id: string;
		providerId: string;
		issuer: string;
		domain: string;
		userId: string;
		organizationId?: string;
		domainVerified?: boolean;
		samlConfig?: string;
		oidcConfig?: string;
	}

	const createTestAuth = (
		includeOrgPlugin = true,
		enableDomainVerification = false,
	) => {
		const data: {
			user: { id: string; email: string }[];
			session: object[];
			verification: object[];
			account: object[];
			ssoProvider: SSOProviderData[];
			member: object[];
			organization: object[];
		} = {
			user: [],
			session: [],
			verification: [],
			account: [],
			ssoProvider: [],
			member: [],
			organization: [],
		};

		const memory = memoryAdapter(data);

		const ssoPlugin = enableDomainVerification
			? sso({ domainVerification: { enabled: true } })
			: sso();
		const plugins = includeOrgPlugin
			? [ssoPlugin, organization()]
			: [ssoPlugin];

		const auth = betterAuth({
			database: memory,
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: true,
			},
			plugins,
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [ssoClient()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		async function getAuthHeaders(user: TestUser) {
			const headers = new Headers();
			await authClient.signUp.email({
				email: user.email,
				password: user.password,
				name: user.name,
			});

			await authClient.signIn.email(user, {
				throw: true,
				onSuccess: setCookieToHeader(headers),
			});

			return headers;
		}

		async function createOrganization(name: string, headers: Headers) {
			return auth.api.createOrganization({
				body: {
					name,
					slug: name,
				},
				headers,
			});
		}

		async function addMember(
			userId: string,
			organizationId: string,
			role: "member" | "admin" | "owner",
			headers: Headers,
		) {
			return auth.api.addMember({
				body: {
					userId,
					role,
					organizationId,
				},
				headers,
			});
		}

		async function registerSAMLProvider(
			headers: Headers,
			providerId: string,
			organizationId?: string,
		) {
			return auth.api.registerSSOProvider({
				body: {
					providerId,
					issuer: "https://idp.example.com",
					domain: "example.com",
					samlConfig: {
						entryPoint: "https://idp.example.com/sso",
						cert: TEST_CERT,
						callbackUrl: "http://localhost:3000/api/sso/callback",
						audience: "my-audience",
						wantAssertionsSigned: true,
						spMetadata: {},
					},
					organizationId,
				},
				headers,
			});
		}

		function createOIDCProviderData(
			userId: string,
			providerId: string,
			clientId: string,
			organizationId?: string,
		) {
			data.ssoProvider.push({
				id: `oidc-${providerId}`,
				providerId,
				issuer: "https://idp.example.com",
				domain: "example.com",
				userId,
				organizationId,
				oidcConfig: JSON.stringify({
					clientId,
					clientSecret: "super-secret-value",
					discoveryEndpoint: "https://idp.example.com/.well-known",
					pkce: true,
				}),
			});
		}

		return {
			auth,
			authClient,
			data,
			getAuthHeaders,
			createOrganization,
			addMember,
			registerSAMLProvider,
			createOIDCProviderData,
		};
	};

	describe("GET /sso/providers", () => {
		it("should return 401 when not authenticated", async () => {
			const { auth } = createTestAuth();
			const response = await auth.api.listSSOProviders({
				asResponse: true,
			});
			expect(response.status).toBe(401);
		});

		it("should return empty list when no providers exist", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders({
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			});

			const response = await auth.api.listSSOProviders({ headers });
			expect(response.providers).toEqual([]);
		});

		it("should return only providers owned by the user", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider, data } =
				createTestAuth(false);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(ownerHeaders, "my-saml-provider");

			// Create another user's provider by pushing directly to data
			data.ssoProvider.push({
				id: "provider-2",
				providerId: "other-provider",
				issuer: "https://other.com",
				domain: "other.com",
				userId: "different-user-id",
				oidcConfig: JSON.stringify({
					clientId: "client123456",
					clientSecret: "secret",
					discoveryEndpoint: "https://other.com/.well-known",
					pkce: true,
				}),
			});

			const response = await auth.api.listSSOProviders({
				headers: ownerHeaders,
			});

			expect(response.providers).toHaveLength(1);
			expect(response.providers[0]!.providerId).toBe("my-saml-provider");
		});

		it("should return providers for org admin when org plugin enabled", async () => {
			const { auth, getAuthHeaders, createOrganization, registerSAMLProvider } =
				createTestAuth(true);

			const adminHeaders = await getAuthHeaders({
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			});

			const org = await createOrganization("test-org", adminHeaders);

			await registerSAMLProvider(adminHeaders, "org-saml-provider", org!.id);

			const response = await auth.api.listSSOProviders({
				headers: adminHeaders,
			});

			expect(response.providers).toHaveLength(1);
			expect(response.providers[0]!.providerId).toBe("org-saml-provider");
		});

		it("should return providers for org owner", async () => {
			const { auth, getAuthHeaders, createOrganization, registerSAMLProvider } =
				createTestAuth(true);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const org = await createOrganization("test-org", ownerHeaders);

			await registerSAMLProvider(ownerHeaders, "org-saml-provider", org!.id);

			const response = await auth.api.listSSOProviders({
				headers: ownerHeaders,
			});

			expect(response.providers).toHaveLength(1);
			expect(response.providers[0]!.providerId).toBe("org-saml-provider");
		});

		it("should handle comma-separated roles", async () => {
			const {
				auth,
				getAuthHeaders,
				createOrganization,
				registerSAMLProvider,
				data,
			} = createTestAuth(true);

			const creatorHeaders = await getAuthHeaders({
				email: "creator@example.com",
				password: "password123",
				name: "Creator",
			});

			const org = await createOrganization("test-org", creatorHeaders);

			await registerSAMLProvider(creatorHeaders, "org-saml-provider", org!.id);

			const multiHeaders = await getAuthHeaders({
				email: "multi@example.com",
				password: "password123",
				name: "Multi Role User",
			});

			const multiUser = data.user.find((u) => u.email === "multi@example.com");

			// Push directly to test comma-separated roles (API doesn't accept this format)
			data.member.push({
				id: "multi-member",
				userId: multiUser!.id,
				organizationId: org!.id,
				role: "admin,member",
				createdAt: new Date(),
			});

			const response = await auth.api.listSSOProviders({
				headers: multiHeaders,
			});

			expect(response.providers).toHaveLength(1);
		});

		it("should not return org providers to non-admin members", async () => {
			const {
				auth,
				getAuthHeaders,
				createOrganization,
				addMember,
				registerSAMLProvider,
				data,
			} = createTestAuth(true);

			const creatorHeaders = await getAuthHeaders({
				email: "creator@example.com",
				password: "password123",
				name: "Creator",
			});

			const org = await createOrganization("test-org", creatorHeaders);

			await registerSAMLProvider(creatorHeaders, "org-saml-provider", org!.id);

			const memberHeaders = await getAuthHeaders({
				email: "member@example.com",
				password: "password123",
				name: "Member",
			});

			const memberUser = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "member@example.com",
			);

			await addMember(memberUser!.id, org!.id, "member", creatorHeaders);

			const response = await auth.api.listSSOProviders({
				headers: memberHeaders,
			});

			expect(response.providers).toHaveLength(0);
		});
	});

	describe("GET /sso/providers/:providerId", () => {
		it("should return 401 when not authenticated", async () => {
			const { auth } = createTestAuth();
			const response = await auth.api.getSSOProvider({
				params: { providerId: "test" },
				asResponse: true,
			});
			expect(response.status).toBe(401);
		});

		it("should return 404 when provider not found", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders({
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			});

			const response = await auth.api.getSSOProvider({
				params: { providerId: "nonexistent" },
				headers,
				asResponse: true,
			});
			expect(response.status).toBe(404);
		});

		it("should return 403 when user does not own provider", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(ownerHeaders, "other-provider");

			const otherHeaders = await getAuthHeaders({
				email: "other@example.com",
				password: "password123",
				name: "Other User",
			});

			const response = await auth.api.getSSOProvider({
				params: { providerId: "other-provider" },
				headers: otherHeaders,
				asResponse: true,
			});
			expect(response.status).toBe(403);
		});

		it("should return sanitized SAML provider details", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const response = await auth.api.getSSOProvider({
				params: { providerId: "my-saml-provider" },
				headers,
			});

			expect(response.providerId).toBe("my-saml-provider");
			expect(response.type).toBe("saml");
			expect(response.issuer).toBe("https://idp.example.com");
			expect(response.samlConfig).toBeDefined();
			expect(response.samlConfig?.entryPoint).toBe(
				"https://idp.example.com/sso",
			);
			expect(response.samlConfig?.certificate).toBeDefined();
			expect(response.spMetadataUrl).toContain("/sso/saml2/sp/metadata");
		});

		it("should return sanitized OIDC provider with masked clientId", async () => {
			const { auth, getAuthHeaders, createOIDCProviderData, data } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const user = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "owner@example.com",
			);
			createOIDCProviderData(
				user!.id,
				"my-oidc-provider",
				"my-client-id-12345",
			);

			const response = await auth.api.getSSOProvider({
				params: { providerId: "my-oidc-provider" },
				headers,
			});

			expect(response.providerId).toBe("my-oidc-provider");
			expect(response.type).toBe("oidc");
			expect(response.oidcConfig).toBeDefined();
			expect(response.oidcConfig?.clientIdLastFour).toBe("****2345");
			expect(response.oidcConfig?.discoveryEndpoint).toBe(
				"https://idp.example.com/.well-known",
			);
			expect(response.oidcConfig).not.toHaveProperty("clientSecret");
		});

		it("should not leak clientSecret in response", async () => {
			const { auth, getAuthHeaders, createOIDCProviderData, data } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const user = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "owner@example.com",
			);
			createOIDCProviderData(user!.id, "my-oidc-provider", "client123");

			const response = await auth.api.getSSOProvider({
				params: { providerId: "my-oidc-provider" },
				headers,
			});

			const responseStr = JSON.stringify(response);
			expect(responseStr).not.toContain("super-secret-value");
			expect(responseStr).not.toContain("clientSecret");
		});
	});

	describe("sanitization", () => {
		it("should not expose raw certificate PEM", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const response = await auth.api.getSSOProvider({
				params: { providerId: "my-saml-provider" },
				headers,
			});

			const responseStr = JSON.stringify(response);
			expect(responseStr).not.toContain("BEGIN CERTIFICATE");
			expect(responseStr).not.toContain(TEST_CERT);
		});

		it("should handle certificate parse errors gracefully", async () => {
			const { auth, getAuthHeaders, data } = createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const user = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "owner@example.com",
			);

			data.ssoProvider.push({
				id: "provider-1",
				providerId: "my-saml-provider",
				issuer: "https://idp.example.com",
				domain: "example.com",
				userId: user!.id,
				samlConfig: JSON.stringify({
					entryPoint: "https://idp.example.com/sso",
					cert: "invalid-cert-data",
					callbackUrl: "http://localhost:3000/api/sso/callback",
				}),
			});

			const response = await auth.api.getSSOProvider({
				params: { providerId: "my-saml-provider" },
				headers,
			});

			expect(response.samlConfig?.certificate).toBeDefined();
			expect(
				(response.samlConfig?.certificate as { error?: string })?.error,
			).toBe("Failed to parse certificate");
		});

		it("should mask short clientId with just asterisks", async () => {
			const { auth, getAuthHeaders, createOIDCProviderData, data } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const user = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "owner@example.com",
			);
			createOIDCProviderData(user!.id, "my-oidc-provider", "abc");

			const response = await auth.api.getSSOProvider({
				params: { providerId: "my-oidc-provider" },
				headers,
			});

			expect(response.oidcConfig?.clientIdLastFour).toBe("****");
		});
	});

	describe("PATCH /sso/providers/:providerId", () => {
		it("should return 401 when not authenticated", async () => {
			const { auth } = createTestAuth();
			const response = await auth.api.updateSSOProvider({
				params: { providerId: "test" },
				body: { domain: "new-domain.com" },
				asResponse: true,
			});
			expect(response.status).toBe(401);
		});

		it("should return 404 when provider not found", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders({
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			});

			const response = await auth.api.updateSSOProvider({
				params: { providerId: "nonexistent" },
				body: { domain: "new-domain.com" },
				headers,
				asResponse: true,
			});
			expect(response.status).toBe(404);
		});

		it("should return 403 when user does not own provider", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(ownerHeaders, "other-provider");

			const otherHeaders = await getAuthHeaders({
				email: "other@example.com",
				password: "password123",
				name: "Other User",
			});

			const response = await auth.api.updateSSOProvider({
				params: { providerId: "other-provider" },
				body: { domain: "new-domain.com" },
				headers: otherHeaders,
				asResponse: true,
			});
			expect(response.status).toBe(403);
		});

		it("should update domain and reset domainVerified to false", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } = createTestAuth(
				false,
				true,
			);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const updated = await auth.api.updateSSOProvider({
				params: { providerId: "my-saml-provider" },
				body: { domain: "new-domain.com" },
				headers,
			});

			expect(updated.domain).toBe("new-domain.com");
			expect(updated.domainVerified).toBe(false);
		});

		it("should perform partial update on SAML provider", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const updated = await auth.api.updateSSOProvider({
				params: { providerId: "my-saml-provider" },
				body: {
					samlConfig: {
						audience: "new-audience",
						wantAssertionsSigned: false,
					},
				},
				headers,
			});

			expect(updated.samlConfig?.audience).toBe("new-audience");
			expect(updated.samlConfig?.wantAssertionsSigned).toBe(false);
			expect(updated.samlConfig?.entryPoint).toBe(
				"https://idp.example.com/sso",
			);
		});

		it("should perform partial update on OIDC provider", async () => {
			const { auth, getAuthHeaders, createOIDCProviderData, data } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const user = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "owner@example.com",
			);
			createOIDCProviderData(user!.id, "my-oidc-provider", "client123");

			const updated = await auth.api.updateSSOProvider({
				params: { providerId: "my-oidc-provider" },
				body: {
					oidcConfig: {
						scopes: ["openid", "email", "profile", "custom"],
						pkce: false,
					},
				},
				headers,
			});

			expect(updated.oidcConfig?.scopes).toEqual([
				"openid",
				"email",
				"profile",
				"custom",
			]);
			expect(updated.oidcConfig?.pkce).toBe(false);
		});

		it("should update issuer", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const updated = await auth.api.updateSSOProvider({
				params: { providerId: "my-saml-provider" },
				body: { issuer: "https://new-issuer.example.com" },
				headers,
			});

			expect(updated.issuer).toBe("https://new-issuer.example.com");
		});

		it("should return 400 when issuer is invalid URL", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const response = await auth.api.updateSSOProvider({
				params: { providerId: "my-saml-provider" },
				body: { issuer: "invalid-url" },
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(400);
		});

		it("should return 400 when no fields provided", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const response = await auth.api.updateSSOProvider({
				params: { providerId: "my-saml-provider" },
				body: {},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(400);
		});

		it("should allow org admin to update org provider", async () => {
			const {
				auth,
				getAuthHeaders,
				createOrganization,
				registerSAMLProvider,
				addMember,
				data,
			} = createTestAuth(true);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const org = await createOrganization("test-org", ownerHeaders);
			await registerSAMLProvider(ownerHeaders, "org-provider", org!.id);

			const adminHeaders = await getAuthHeaders({
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			});

			const adminUser = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "admin@example.com",
			);

			await addMember(adminUser!.id, org!.id, "admin", ownerHeaders);

			const updated = await auth.api.updateSSOProvider({
				params: { providerId: "org-provider" },
				body: { domain: "new-domain.com" },
				headers: adminHeaders,
			});

			expect(updated.domain).toBe("new-domain.com");
		});

		it("should return 403 when org member tries to update org provider", async () => {
			const {
				auth,
				getAuthHeaders,
				createOrganization,
				registerSAMLProvider,
				addMember,
				data,
			} = createTestAuth(true);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const org = await createOrganization("test-org", ownerHeaders);
			await registerSAMLProvider(ownerHeaders, "org-provider", org!.id);

			const memberHeaders = await getAuthHeaders({
				email: "member@example.com",
				password: "password123",
				name: "Member",
			});

			const memberUser = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "member@example.com",
			);

			await addMember(memberUser!.id, org!.id, "member", ownerHeaders);

			const response = await auth.api.updateSSOProvider({
				params: { providerId: "org-provider" },
				body: { domain: "new-domain.com" },
				headers: memberHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(403);
		});

		it("should return 400 when trying to update SAML config for OIDC provider", async () => {
			const { auth, getAuthHeaders, createOIDCProviderData, data } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const user = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "owner@example.com",
			);
			createOIDCProviderData(user!.id, "my-oidc-provider", "client123");

			const response = await auth.api.updateSSOProvider({
				params: { providerId: "my-oidc-provider" },
				body: {
					samlConfig: {
						entryPoint: "https://idp.example.com/sso",
						cert: TEST_CERT,
						callbackUrl: "http://localhost:3000/api/sso/callback",
						spMetadata: {},
					},
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(400);
		});

		it("should return 400 when trying to update OIDC config for SAML provider", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const response = await auth.api.updateSSOProvider({
				params: { providerId: "my-saml-provider" },
				body: {
					oidcConfig: {
						clientId: "new-client-id",
						clientSecret: "new-secret",
					},
				},
				headers,
				asResponse: true,
			});

			expect(response.status).toBe(400);
		});
	});

	describe("DELETE /sso/providers/:providerId", () => {
		it("should return 401 when not authenticated", async () => {
			const { auth } = createTestAuth();
			const response = await auth.api.deleteSSOProvider({
				params: { providerId: "test" },
				asResponse: true,
			});
			expect(response.status).toBe(401);
		});

		it("should return 404 when provider not found", async () => {
			const { auth, getAuthHeaders } = createTestAuth();
			const headers = await getAuthHeaders({
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			});

			const response = await auth.api.deleteSSOProvider({
				params: { providerId: "nonexistent" },
				headers,
				asResponse: true,
			});
			expect(response.status).toBe(404);
		});

		it("should return 403 when user does not own provider", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(ownerHeaders, "other-provider");

			const otherHeaders = await getAuthHeaders({
				email: "other@example.com",
				password: "password123",
				name: "Other User",
			});

			const response = await auth.api.deleteSSOProvider({
				params: { providerId: "other-provider" },
				headers: otherHeaders,
				asResponse: true,
			});
			expect(response.status).toBe(403);
		});

		it("should delete provider successfully", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const deleteResponse = await auth.api.deleteSSOProvider({
				params: { providerId: "my-saml-provider" },
				headers,
			});

			expect(deleteResponse.success).toBe(true);

			const getResponse = await auth.api.getSSOProvider({
				params: { providerId: "my-saml-provider" },
				headers,
				asResponse: true,
			});

			expect(getResponse.status).toBe(404);
		});

		it("should allow org admin to delete org provider", async () => {
			const {
				auth,
				getAuthHeaders,
				createOrganization,
				registerSAMLProvider,
				addMember,
				data,
			} = createTestAuth(true);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const org = await createOrganization("test-org", ownerHeaders);
			await registerSAMLProvider(ownerHeaders, "org-provider", org!.id);

			const adminHeaders = await getAuthHeaders({
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			});

			const adminUser = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "admin@example.com",
			);

			await addMember(adminUser!.id, org!.id, "admin", ownerHeaders);

			const deleteResponse = await auth.api.deleteSSOProvider({
				params: { providerId: "org-provider" },
				headers: adminHeaders,
			});

			expect(deleteResponse.success).toBe(true);
		});

		it("should return 403 when org member tries to delete org provider", async () => {
			const {
				auth,
				getAuthHeaders,
				createOrganization,
				registerSAMLProvider,
				addMember,
				data,
			} = createTestAuth(true);

			const ownerHeaders = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			const org = await createOrganization("test-org", ownerHeaders);
			await registerSAMLProvider(ownerHeaders, "org-provider", org!.id);

			const memberHeaders = await getAuthHeaders({
				email: "member@example.com",
				password: "password123",
				name: "Member",
			});

			const memberUser = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "member@example.com",
			);

			await addMember(memberUser!.id, org!.id, "member", ownerHeaders);

			const response = await auth.api.deleteSSOProvider({
				params: { providerId: "org-provider" },
				headers: memberHeaders,
				asResponse: true,
			});

			expect(response.status).toBe(403);
		});

		it("should not delete linked accounts when provider is deleted", async () => {
			const { auth, getAuthHeaders, registerSAMLProvider, data } =
				createTestAuth(false);

			const headers = await getAuthHeaders({
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			});

			await registerSAMLProvider(headers, "my-saml-provider");

			const user = (data.user as { id: string; email: string }[]).find(
				(u) => u.email === "owner@example.com",
			);

			data.account.push({
				id: "account-1",
				userId: user!.id,
				providerId: "my-saml-provider",
				accountId: "saml-account-id",
				accessToken: "token",
				refreshToken: "refresh",
			});

			const accountCountBefore = data.account.length;

			await auth.api.deleteSSOProvider({
				params: { providerId: "my-saml-provider" },
				headers,
			});

			expect(data.account.length).toBe(accountCountBefore);
		});
	});
});
