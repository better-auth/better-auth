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

const createTestContext = (domainVerificationEnabled = true) => {
	const data = {
		user: [] as User[],
		session: [] as { id: string }[],
		account: [] as { id: string }[],
		ssoProvider: [] as {
			id: string;
			providerId: string;
			issuer: string;
			domain: string;
			domainVerified?: boolean;
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
		invitation: [] as {
			id: string;
			email: string;
			organizationId: string;
			inviterId: string;
			role: string;
			status: "pending" | "accepted" | "canceled" | "rejected";
			expiresAt: Date;
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
			sso(
				domainVerificationEnabled
					? {
							domainVerification: {
								enabled: true,
							},
						}
					: {},
			),
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

describe("assignOrganizationByDomain", () => {
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

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10760
	 */
	it("should find a matching verified provider beyond the default adapter page", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		for (let index = 0; index < 100; index++) {
			data.ssoProvider.push(
				createProvider({
					id: `unrelated-provider-${index}`,
					providerId: `unrelated-provider-${index}`,
					domain: `unrelated-${index}.example`,
					domainVerified: true,
					organizationId: null,
				}),
			);
		}
		data.ssoProvider.push(
			createProvider({
				id: "zz-matching-provider",
				providerId: "zz-matching-provider",
				domainVerified: true,
				organizationId: org.id,
			}),
		);

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		expect(data.member).toHaveLength(1);
		expect(data.member[0]?.organizationId).toBe(org.id);
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

	it("should NOT assign user when domain verification is disabled", async () => {
		const { data, createContext } = createTestContext(false);

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
		expect(members).toHaveLength(0);
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

	it.for([
		{ insertionOrder: ["unverified", "verified"] },
		{ insertionOrder: ["verified", "unverified"] },
	])("should only find the verified provider when multiple providers claim the same domain ($insertionOrder)", async ({
		insertionOrder,
	}) => {
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

		const providers = {
			unverified: createProvider({
				id: "attacker-provider",
				providerId: "attacker-provider",
				issuer: "https://attacker.com",
				domainVerified: false,
				organizationId: attackerOrg.id,
			}),
			verified: createProvider({
				id: "legit-provider",
				providerId: "legit-provider",
				domainVerified: true,
				organizationId: legitOrg.id,
			}),
		};
		data.ssoProvider.push(
			...insertionOrder.map((key) => providers[key as keyof typeof providers]),
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

	it.for([
		{ insertionOrder: ["first", "second"] },
		{ insertionOrder: ["second", "first"] },
	])("should NOT assign user when verified providers map one domain to different organizations ($insertionOrder)", async ({
		insertionOrder,
	}) => {
		const { data, createContext } = createTestContext();

		const firstOrg = createOrg({
			id: "first-org",
			name: "First Org",
			slug: "first-org",
		});
		const secondOrg = createOrg({
			id: "second-org",
			name: "Second Org",
			slug: "second-org",
		});
		data.organization.push(firstOrg, secondOrg);

		const firstProvider = createProvider({
			id: "first-provider",
			providerId: "first-provider",
			domainVerified: true,
			organizationId: firstOrg.id,
		});
		const secondProvider = createProvider({
			id: "second-provider",
			providerId: "second-provider",
			domainVerified: true,
			organizationId: secondOrg.id,
		});
		const providers = { first: firstProvider, second: secondProvider };
		data.ssoProvider.push(
			...insertionOrder.map((key) => providers[key as keyof typeof providers]),
		);

		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		expect(
			data.member.filter((member) => member.userId === user.id),
		).toHaveLength(0);
	});

	it("should assign once when verified providers map one domain to the same organization", async () => {
		const { data, createContext } = createTestContext();
		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({
				id: "second-provider",
				providerId: "second-provider",
				domainVerified: true,
				organizationId: org.id,
			}),
			createProvider({
				id: "first-provider",
				providerId: "first-provider",
				domainVerified: true,
				organizationId: org.id,
			}),
		);
		const user = createUser();
		data.user.push(user);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		expect(data.member).toHaveLength(1);
		expect(data.member[0]?.organizationId).toBe(org.id);
	});

	it("should require the canonical stored user email to be verified", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({
				domainVerified: true,
				organizationId: org.id,
			}),
		);

		const callbackUser = createUser({ emailVerified: true });
		data.user.push(createUser({ emailVerified: false }));

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user: callbackUser,
			domainVerification: { enabled: true },
		});

		expect(data.member).toHaveLength(0);
	});

	it("should use a freshly verified canonical user instead of stale callback state", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		data.organization.push(org);
		data.ssoProvider.push(
			createProvider({
				domainVerified: true,
				organizationId: org.id,
			}),
		);

		const callbackUser = createUser({ emailVerified: false });
		data.user.push(createUser({ emailVerified: true }));

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user: callbackUser,
			domainVerification: { enabled: true },
		});

		const members = data.member.filter(
			(member) => member.userId === callbackUser.id,
		);
		expect(members).toHaveLength(1);
		expect(members[0]?.organizationId).toBe(org.id);
	});

	it("should skip automatic membership while an invitation is pending", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const user = createUser();
		const invitation = {
			id: "invitation-1",
			email: user.email,
			organizationId: org.id,
			inviterId: "inviter-1",
			role: "admin",
			status: "pending" as const,
			expiresAt: new Date(Date.now() + 60_000),
		};
		data.organization.push(org);
		data.user.push(user);
		data.ssoProvider.push(
			createProvider({
				domainVerified: true,
				organizationId: org.id,
			}),
		);
		data.invitation.push(invitation);

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		expect(data.member).toHaveLength(0);
		expect(data.invitation).toEqual([invitation]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10760
	 */
	it("should ignore an expired pending invitation", async () => {
		const { data, createContext } = createTestContext();

		const org = createOrg();
		const user = createUser();
		data.organization.push(org);
		data.user.push(user);
		data.ssoProvider.push(
			createProvider({
				domainVerified: true,
				organizationId: org.id,
			}),
		);
		data.invitation.push({
			id: "expired-invitation",
			email: user.email,
			organizationId: org.id,
			inviterId: "inviter-1",
			role: "admin",
			status: "pending",
			expiresAt: new Date(Date.now() - 60_000),
		});

		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationByDomain(ctx, {
			user,
			domainVerification: { enabled: true },
		});

		expect(data.member).toHaveLength(1);
		expect(data.member[0]?.organizationId).toBe(org.id);
	});

	it("should surface adapter failures instead of treating them as ineligibility", async () => {
		const { data, createContext } = createTestContext();
		const user = createUser();
		data.user.push(user);
		const ctx = (await createContext()) as GenericEndpointContext;
		vi.spyOn(ctx.context.adapter, "findMany").mockRejectedValueOnce(
			new Error("provider lookup failed"),
		);

		await expect(
			assignOrganizationByDomain(ctx, {
				user,
				domainVerification: { enabled: true },
			}),
		).rejects.toThrow("provider lookup failed");
	});
});

describe("assignOrganizationFromProvider", () => {
	it.for([
		"oidc",
		"saml",
	] as const)("should preserve direct %s organization provisioning without domain verification", async (providerType) => {
		const { data, createContext } = createTestContext(false);

		const user = createUser();
		const organizationRecord = createOrg({
			name: "Enterprise",
			slug: "enterprise",
		});
		const provider = {
			...createProvider({
				providerId: "enterprise-provider",
				userId: "owner-1",
			}),
			organizationId: organizationRecord.id,
		};
		data.user.push(user);
		data.organization.push(organizationRecord);
		data.ssoProvider.push(provider);

		const organizationId = organizationRecord.id;
		const ctx = (await createContext()) as GenericEndpointContext;
		await assignOrganizationFromProvider(ctx, {
			user,
			provider,
			profile: {
				providerType,
				providerId: provider.providerId,
				accountId: "enterprise-account",
				email: user.email,
				emailVerified: true,
			},
		});

		expect(data.member).toHaveLength(1);
		expect(data.member[0]).toMatchObject({
			organizationId,
			role: "member",
			userId: user.id,
		});
	});
});
