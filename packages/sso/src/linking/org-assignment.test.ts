import type { GenericEndpointContext, User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { describe, expect, it, vi } from "vitest";
import { sso } from "..";
import {
	assignOrganizationByDomain,
	assignOrganizationFromProvider,
} from "./org-assignment";

describe("organization assignment", () => {
	const createTestContext = () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			account: [] as { id: string }[],
			ssoProvider: [] as {
				id: string;
				providerId: string;
				issuer: string;
				domain: string;
				domainVerified: boolean;
				organizationId: string | null;
				userId: string;
			}[],
			member: [] as {
				id: string;
				organizationId: string;
				userId: string;
				role: string;
				createdAt: Date;
			}[],
			organization: [] as {
				id: string;
				name: string;
				slug: string;
				createdAt: Date;
			}[],
		};

		const memory = memoryAdapter(data);

		const auth = betterAuth({
			database: memory,
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				sso({
					domainVerification: {
						enabled: true,
					},
				}),
				organization(),
			],
		});

		const createContext = async () => {
			const context = await auth.$context;
			return { context } as unknown as Partial<GenericEndpointContext>;
		};

		return { auth, data, createContext };
	};

	const createUser = (overrides: Partial<User> = {}): User => ({
		id: "user-1",
		email: "alice@example.com",
		name: "Alice",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	});

	const createOrg = (
		overrides: Partial<{ id: string; name: string; slug: string }> = {},
	) => ({
		id: "org-1",
		name: "Test Org",
		slug: "test-org",
		createdAt: new Date(),
		...overrides,
	});

	const createProvider = (
		overrides: Partial<{
			id: string;
			providerId: string;
			issuer: string;
			domain: string;
			domainVerified: boolean;
			organizationId: string | null;
			userId: string;
		}> = {},
	) => ({
		id: "provider-1",
		providerId: "test-provider",
		issuer: "https://idp.example.com",
		domain: "example.com",
		domainVerified: false,
		organizationId: "org-1" as string | null,
		userId: "user-1",
		...overrides,
	});

	it("should NOT assign user to org when provider domain is unverified", async () => {
		const { data, createContext } = createTestContext();

		data.organization.push(createOrg());
		data.ssoProvider.push(createProvider({ domainVerified: false }));

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(0);
	});

	it("should assign user to org when provider domain is verified", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({ domainVerified: true, organizationId: org.id }),
		);

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.organizationId).toBe(org.id);
		expect(members[0]?.role).toBe("member");
	});

	it("should assign user when a verified provider's normalized domain set includes the email domain", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({
				domain: "https://attacker.com/path,victim.com",
				domainVerified: true,
				organizationId: org.id,
			}),
		);

		const user = createUser({ email: "alice@victim.com" });
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.organizationId).toBe(org.id);
	});

	it("should NOT assign user when the email domain is malformed", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({
				domain: "victim.com",
				domainVerified: true,
				organizationId: org.id,
			}),
		);

		const user = createUser({ email: "alice@https://victim.com/path" });
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(0);
	});

	it("should NOT assign user when email domain does not match any provider", async () => {
		const { data, createContext } = createTestContext();

		data.organization.push(createOrg());
		data.ssoProvider.push(createProvider({ domainVerified: true }));

		const user = createUser({ email: "alice@other-domain.com" });
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(0);
	});

	it("should NOT assign user when provider has no organizationId", async () => {
		const { data, createContext } = createTestContext();

		data.ssoProvider.push(
			createProvider({ domainVerified: true, organizationId: null }),
		);

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(0);
	});

	it("should NOT assign user when provider has no domainVerified field (verification enabled)", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);

		data.ssoProvider.push({
			id: "provider-1",
			providerId: "test-provider",
			issuer: "https://idp.example.com",
			domain: "example.com",
			organizationId: org.id,
			userId: "user-1",
		} as {
			id: string;
			providerId: string;
			issuer: string;
			domain: string;
			domainVerified: boolean;
			organizationId: string | null;
			userId: string;
		});

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(0);
	});

	it("should assign user when verification is disabled (no domainVerified check)", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({ domainVerified: false, organizationId: org.id }),
		);

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: false },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.organizationId).toBe(org.id);
	});

	it("should not call claims mapper for domain-based assignment", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({ domainVerified: true, organizationId: org.id }),
		);

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
			provisioningOptions: {
				defaultRole: "admin",
				mapClaimsToRoles: async () => {
					throw new Error("claims mapper should only run for SSO callbacks");
				},
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("admin");
	});

	it("should NOT assign user when already a member of the org", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({ domainVerified: true, organizationId: org.id }),
		);

		const user = createUser();
		data.user.push(user);

		data.member.push({
			id: "member-1",
			organizationId: org.id,
			userId: user.id,
			role: "admin",
			createdAt: new Date(),
		});

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("admin");
	});

	it("should not update an existing domain-assigned member role even when syncRoleOnLogin is enabled", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({ domainVerified: true, organizationId: org.id }),
		);

		const user = createUser();
		data.user.push(user);

		data.member.push({
			id: "member-1",
			organizationId: org.id,
			userId: user.id,
			role: "admin",
			createdAt: new Date(),
		});

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
			provisioningOptions: {
				defaultRole: "member",
				syncRoleOnLogin: true,
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("admin");
	});

	it("should only find verified provider when multiple providers claim same domain", async () => {
		const { data, createContext } = createTestContext();

		const legitOrg = createOrg({
			id: "legit-org",
			name: "Legit Org",
			slug: "legit-org",
		});
		const attackerOrg = createOrg({
			id: "attacker-org",
			name: "Attacker Org",
			slug: "attacker-org",
		});
		data.organization.push(legitOrg, attackerOrg);

		data.ssoProvider.push(
			createProvider({
				id: "attacker-provider",
				providerId: "attacker-provider",
				issuer: "https://attacker.com",
				domainVerified: false,
				organizationId: attackerOrg.id,
			}),
		);

		data.ssoProvider.push(
			createProvider({
				id: "legit-provider",
				providerId: "legit-provider",
				domainVerified: true,
				organizationId: legitOrg.id,
			}),
		);

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.organizationId).toBe(legitOrg.id);
	});

	it("should map SSO claims to the role for a new provider organization member", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "oidc",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: { email: user.email },
				claims: { groups: ["engineering-admins"] },
			},
			provisioningOptions: {
				defaultRole: "member",
				mapClaimsToRoles: async ({ claims }) =>
					(claims.groups as string[] | undefined)?.includes(
						"engineering-admins",
					)
						? "admin"
						: "member",
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.organizationId).toBe(org.id);
		expect(members[0]?.role).toBe("admin");
	});

	it("should pass normalized user info and raw claims to the role mapper", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);

		const normalizedUserInfo = {
			email: user.email,
			department: "Engineering",
		};
		const rawClaims = {
			groups: ["engineering-admins"],
			"urn:example:email": user.email,
		};
		let resolvedUserInfo: Record<string, unknown> | undefined;
		let resolvedClaims: Record<string, unknown> | undefined;

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "saml",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: normalizedUserInfo,
				claims: rawClaims,
			},
			provisioningOptions: {
				mapClaimsToRoles: async ({ userInfo, claims }) => {
					resolvedUserInfo = userInfo;
					resolvedClaims = claims;
					return "member";
				},
			},
		});

		expect(resolvedUserInfo).toEqual(normalizedUserInfo);
		expect(resolvedClaims).toEqual(rawClaims);
	});

	it("should keep SAML getRole userInfo backward-compatible with raw attributes", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);

		const normalizedUserInfo = {
			email: user.email,
			name: user.name,
		};
		const rawClaims = {
			groups: ["engineering-admins"],
			"urn:example:email": user.email,
		};
		let resolvedUserInfo: Record<string, unknown> | undefined;

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "saml",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: normalizedUserInfo,
				claims: rawClaims,
			},
			provisioningOptions: {
				getRole: async ({ userInfo }) => {
					resolvedUserInfo = userInfo;
					return (userInfo.groups as string[] | undefined)?.includes(
						"engineering-admins",
					)
						? "admin"
						: "member";
				},
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("admin");
		expect(resolvedUserInfo).toEqual(rawClaims);
	});

	it("should fail organization assignment when mapClaimsToRoles throws", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await expect(
			assignOrganizationFromProvider(ctx, {
				user,
				provider,
				profile: {
					providerType: "oidc",
					providerId: provider.providerId,
					providerAccountId: "idp-user-1",
					email: user.email,
					emailVerified: true,
					rawAttributes: { email: user.email },
					claims: { groups: ["engineering-admins"] },
				},
				provisioningOptions: {
					mapClaimsToRoles: async () => {
						throw new Error("claims mapper failed");
					},
				},
			}),
		).rejects.toThrow("claims mapper failed");

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(0);
	});

	it("should not update an existing provider organization member role with getRole by default", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);
		data.member.push({
			id: "member-1",
			organizationId: org.id,
			userId: user.id,
			role: "member",
			createdAt: new Date(),
		});

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "oidc",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: { email: user.email },
				claims: { groups: ["engineering-admins"] },
			},
			provisioningOptions: {
				getRole: async () => "admin",
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("member");
	});

	it("should update an existing provider organization member role by default with mapClaimsToRoles", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);
		data.member.push({
			id: "member-1",
			organizationId: org.id,
			userId: user.id,
			role: "member",
			createdAt: new Date(),
		});

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "oidc",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: { email: user.email },
				claims: { groups: ["engineering-admins"] },
			},
			provisioningOptions: {
				mapClaimsToRoles: async ({ claims }) =>
					(claims.groups as string[] | undefined)?.includes(
						"engineering-admins",
					)
						? "admin"
						: "member",
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("admin");
	});

	it("should not update an existing provider organization member role when mapClaimsToRoles sync is disabled", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);
		data.member.push({
			id: "member-1",
			organizationId: org.id,
			userId: user.id,
			role: "member",
			createdAt: new Date(),
		});

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "oidc",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: { email: user.email },
				claims: { groups: ["engineering-admins"] },
			},
			provisioningOptions: {
				syncRoleOnLogin: false,
				mapClaimsToRoles: async () => "admin",
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("member");
	});

	it("should update an existing provider organization member role with getRole when syncRoleOnLogin is enabled", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);
		data.member.push({
			id: "member-1",
			organizationId: org.id,
			userId: user.id,
			role: "member",
			createdAt: new Date(),
		});

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "saml",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: { email: user.email },
				claims: { groups: ["engineering-admins"] },
			},
			provisioningOptions: {
				defaultRole: "member",
				syncRoleOnLogin: true,
				getRole: async ({ userInfo }) =>
					(userInfo.groups as string[] | undefined)?.includes(
						"engineering-admins",
					)
						? "admin"
						: "member",
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("admin");
	});

	it("should not remove a creator role during provider role sync", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);
		data.member.push({
			id: "member-1",
			organizationId: org.id,
			userId: user.id,
			role: "owner",
			createdAt: new Date(),
		});

		const ctx = (await createContext()) as GenericEndpointContext;
		const warn = vi.spyOn(ctx.context.logger, "warn");
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "saml",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: { email: user.email },
				claims: { groups: ["engineering"] },
			},
			provisioningOptions: {
				mapClaimsToRoles: async () => "member",
			},
		});

		const members = data.member.filter((m) => m.userId === user.id);
		expect(members).toHaveLength(1);
		expect(members[0]?.role).toBe("owner");
		expect(warn).toHaveBeenCalledWith(
			"Skipped SSO organization role sync because automatic synchronization cannot remove a creator role",
			{
				memberId: "member-1",
				organizationId: org.id,
				providerId: provider.providerId,
			},
		);
	});

	it("should not remove a creator role when another creator remains", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const provider = {
			...createProvider({ organizationId: org.id }),
			organizationId: org.id,
		};
		const user = createUser();
		const otherUser = createUser({
			id: "user-2",
			email: "bob@example.com",
			name: "Bob",
		});
		data.organization.push(org);
		data.user.push(user, otherUser);
		data.member.push(
			{
				id: "member-1",
				organizationId: org.id,
				userId: user.id,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: "member-2",
				organizationId: org.id,
				userId: otherUser.id,
				role: "admin,owner",
				createdAt: new Date(),
			},
		);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType: "saml",
				providerId: provider.providerId,
				providerAccountId: "idp-user-1",
				email: user.email,
				emailVerified: true,
				rawAttributes: { email: user.email },
				claims: { groups: ["engineering"] },
			},
			provisioningOptions: {
				mapClaimsToRoles: async () => "member",
			},
		});

		const member = data.member.find((m) => m.id === "member-1");
		const otherMember = data.member.find((m) => m.id === "member-2");
		expect(member?.role).toBe("owner");
		expect(otherMember?.role).toBe("admin,owner");
	});
});
