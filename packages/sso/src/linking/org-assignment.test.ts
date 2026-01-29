import type { GenericEndpointContext, User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { sso } from "..";
import { assignOrganizationByDomain } from "./org-assignment";

describe("assignOrganizationByDomain", () => {
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
});
