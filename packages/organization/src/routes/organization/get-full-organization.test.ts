import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect, expectTypeOf } from "vitest";
import { teams } from "../../addons";
import { organizationClient } from "../../client";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { getOrganizationData } from "../../test/utils";

/**
 * Helper to define `getTestInstance` as a shorter alias, specific to the organization plugin.
 * @internal
 */
async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);
	const adapter = (await instance.auth.$context).adapter;
	return { ...instance, adapter };
}

describe("get full organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser, client, cookieSetter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should allow getting full org on server", async () => {
		const orgData = getOrganizationData();
		const organization = await auth.api.createOrganization({
			headers,
			body: orgData,
		});
		const org = await auth.api.getFullOrganization({
			query: {
				organizationId: organization.id,
			},
			headers,
		});
		expect(org?.members.length).toBe(1);
		expect(Array.isArray(org?.invitations)).toBe(true);
		expect(org).not.toHaveProperty("teams");
	});

	it("should throw FORBIDDEN when user is not a member of the organization", async () => {
		const orgData = getOrganizationData();
		const organization = await auth.api.createOrganization({
			headers,
			body: orgData,
		});
		const newHeaders = new Headers();
		await client.signUp.email(
			{
				email: "test3@test.com",
				password: "password",
				name: "test3",
			},
			{
				onSuccess: cookieSetter(newHeaders),
			},
		);
		const result = await client.organization.getFullOrganization({
			query: {
				organizationId: organization!.id,
			},
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(result.error?.status).toBe(403);
		expect(result.error?.message).toContain(
			ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION.message,
		);
	});

	it("should throw BAD_REQUEST when organization doesn't exist", async () => {
		const result = await client.organization.getFullOrganization({
			query: {
				organizationId: "non-existent-org-id",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(result.error?.status).toBe(400);
		expect(result.error?.message).toContain(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND.message,
		);
	});

	it("should return null when no organizationId is provided and no active organization is set", async () => {
		const newHeaders = new Headers();
		await client.signUp.email(
			{
				email: `no-active-org-${crypto.randomUUID()}@test.com`,
				password: "password",
				name: "no active org user",
			},
			{
				onSuccess: cookieSetter(newHeaders),
			},
		);

		const result = await client.organization.getFullOrganization({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(result.data).toBeNull();
	});

	it("should fall back to active organization when no organizationId is provided", async () => {
		const orgData = getOrganizationData();
		const createdOrg = await auth.api.createOrganization({
			headers,
			body: orgData,
		});

		await auth.api.setActiveOrganization({
			headers,
			body: { organizationId: createdOrg.id },
		});

		const org = await auth.api.getFullOrganization({ headers });
		expect(org).not.toBeNull();
		expect(org?.id).toBe(createdOrg.id);
		expect(org?.members.length).toBeGreaterThanOrEqual(1);
	});

	it("should respect membersLimit query parameter", async () => {
		const orgData = getOrganizationData();
		const createdOrg = await auth.api.createOrganization({
			headers,
			body: orgData,
		});

		for (let i = 0; i < 3; i++) {
			const user = await auth.api.signUpEmail({
				body: {
					email: `member-limit-${i}-${crypto.randomUUID()}@test.com`,
					password: "password",
					name: `member ${i}`,
				},
			});
			await auth.api.addMember({
				body: {
					organizationId: createdOrg.id,
					userId: user.user.id,
					role: "member",
				},
			});
		}

		const orgFull = await auth.api.getFullOrganization({
			headers,
			query: {
				organizationId: createdOrg.id,
			},
		});
		expect(orgFull?.members.length).toBe(4);

		const orgLimited = await auth.api.getFullOrganization({
			headers,
			query: {
				organizationId: createdOrg.id,
				membersLimit: 2,
			},
		});
		expect(orgLimited?.members.length).toBe(2);
	});

	it("should include member field in response with current user's membership", async () => {
		const orgData = getOrganizationData();
		const createdOrg = await auth.api.createOrganization({
			headers,
			body: orgData,
		});

		const org = await auth.api.getFullOrganization({
			headers,
			query: {
				organizationId: createdOrg.id,
			},
		});

		expect(org?.member).toBeDefined();
		expect(org?.member.role).toBe("owner");
		expect(org?.member.organizationId).toBe(createdOrg.id);
	});

	describe("should work with slug", async (it) => {
		const plugin = organization({ defaultOrganizationIdField: "slug" });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		it("should allow getting full org on server with slug", async () => {
			const orgData = getOrganizationData();
			const organization = await auth.api.createOrganization({
				headers,
				body: orgData,
			});

			const org = await auth.api.getFullOrganization({
				headers,
				query: {
					organizationId: organization.slug,
				},
			});
			expect(org?.members.length).toBe(1);
		});

		it("should not allow getting org with id when using slug as the default organization id field", async () => {
			const orgData = getOrganizationData();
			const organization = await auth.api.createOrganization({
				headers,
				body: orgData,
			});

			await expect(async () => {
				await auth.api.getFullOrganization({
					headers,
					query: {
						organizationId: organization.id,
					},
				});
			}).rejects.toThrow("Organization not found");
		});
	});

	describe("should work with teams addon", async (it) => {
		const teamsAddon = teams({ enableSlugs: true });
		const plugin = organization({ use: [teamsAddon] });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		it("should return teams when teams addon is enabled", async () => {
			const orgData = getOrganizationData();
			const createdOrg = await auth.api.createOrganization({
				headers,
				body: orgData,
			});

			const org = await auth.api.getFullOrganization({
				headers,
				query: {
					organizationId: createdOrg.id,
				},
			})!;

			expect(org).not.toBeNull();
			expect(org).toHaveProperty("teams");
			expect(org).toHaveProperty("members");
			expect(org).toHaveProperty("invitations");
			expect(Array.isArray(org?.teams)).toBe(true);
			expect(Array.isArray(org?.members)).toBe(true);
			expect(Array.isArray(org?.invitations)).toBe(true);
			expect(org!.teams[0]);

			type NonNullOrg = NonNullable<typeof org>;
			type Teams = NonNullOrg["teams"];
			type Expected = {
				id: string;
				name: string;
				organizationId: string;
				createdAt: Date;
				updatedAt?: Date | undefined;
				slug: string;
			};
			expectTypeOf<Teams>().toEqualTypeOf<Expected[]>();

			const team = org!.teams[0]!;
			expect(team).toBeDefined();
			expect(team.id).toBeDefined();
			expect(team.name).toBeDefined();
			expect(team.organizationId).toBeDefined();
			expect(team.createdAt).toBeDefined();
			expect(team.slug).toBeDefined();
			expect(team.updatedAt).toBeDefined();
		});
	});

	describe("should not return teams when teams addon is not enabled", async (it) => {
		const plugin = organization();
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		it("should not have team property when teams addon is disabled", async () => {
			const orgData = getOrganizationData();
			const createdOrg = await auth.api.createOrganization({
				headers,
				body: orgData,
			});

			const org = await auth.api.getFullOrganization({
				headers,
				query: {
					organizationId: createdOrg.id,
				},
			});

			expect(org).not.toBeNull();
			// Team should not be present when teams addon is not enabled
			// Access via bracket notation to bypass type checking for runtime assertion
			expect((org as Record<string, unknown>)["team"]).toBeUndefined();
		});
	});
});
