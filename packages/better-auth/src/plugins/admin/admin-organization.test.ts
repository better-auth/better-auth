import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAccessControl } from "../access";
import { organization } from "../organization";
import { admin } from "./admin";
import { adminClient } from "./client";

describe("Admin organization listing", async () => {
	const { auth, signInWithTestUser, signInWithUser, customFetchImpl } =
		await getTestInstance(
			{
				plugins: [
					admin({ organizations: { enabled: true } }),
					organization({
						schema: {
							organization: {
								additionalFields: {
									internalNote: {
										type: "string",
										required: false,
										returned: false,
									},
								},
							},
						},
					}),
				],
				databaseHooks: {
					user: {
						create: {
							before: async (user) => ({
								data: {
									...user,
									...(user.name === "Admin" ? { role: "admin" } : {}),
								},
							}),
						},
					},
				},
			},
			{ testUser: { name: "Admin" } },
		);

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [adminClient({ organizations: { enabled: true } })],
		fetchOptions: { customFetchImpl },
	});
	const { headers: adminHeaders } = await signInWithTestUser();

	const memberUser = {
		email: "organization-member@test.com",
		password: "password",
		name: "Organization Member",
	};
	await client.signUp.email(memberUser);
	const { headers: memberHeaders } = await signInWithUser(
		memberUser.email,
		memberUser.password,
	);

	await auth.api.createOrganization({
		headers: memberHeaders,
		body: {
			name: "Beta Org",
			slug: "beta-org",
			metadata: { plan: "pro" },
			internalNote: "internal-beta",
		},
	});
	await auth.api.createOrganization({
		headers: memberHeaders,
		body: {
			name: "Alpha Org",
			slug: "alpha-org",
			internalNote: "internal-alpha",
		},
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9735
	 */
	it("allows an admin to list organizations without being a member", async () => {
		const result = await client.admin.listOrganizations({
			query: {
				sortBy: "name",
				sortDirection: "asc",
			},
			fetchOptions: { headers: adminHeaders },
		});

		expect(result.data?.organizations.map((org) => org.name)).toEqual([
			"Alpha Org",
			"Beta Org",
		]);
		expect(result.data?.total).toBe(2);
		expect(result.data?.organizations[1]?.metadata).toEqual({ plan: "pro" });
		expect(
			(result.data?.organizations[0] as { internalNote?: string } | undefined)
				?.internalNote,
		).toBeUndefined();

		const memberScoped = await auth.api.listOrganizations({
			headers: adminHeaders,
		});
		expect(memberScoped).toEqual([]);

		const serverResult = await auth.api.adminListOrganizations({
			headers: adminHeaders,
			query: {
				filterField: "slug",
				filterValue: "beta-org",
			},
		});
		expect(serverResult.organizations.map((org) => org.name)).toEqual([
			"Beta Org",
		]);
	});

	it("supports pagination and organization search filters", async () => {
		const page = await client.admin.listOrganizations({
			query: {
				searchValue: "Beta",
				searchField: "name",
				limit: 1,
				offset: 0,
			},
			fetchOptions: { headers: adminHeaders },
		});

		expect(page.data?.organizations.map((org) => org.slug)).toEqual([
			"beta-org",
		]);
		expect(page.data?.total).toBe(1);
		expect(page.data?.limit).toBe(1);
		expect(page.data?.offset).toBe(0);

		const zeroLimit = await client.admin.listOrganizations({
			query: {
				limit: 0,
				offset: 0,
			},
			fetchOptions: { headers: adminHeaders },
		});
		expect(zeroLimit.data?.organizations).toEqual([]);
		expect(zeroLimit.data?.limit).toBe(0);
		expect(zeroLimit.data?.offset).toBe(0);

		const blankPagination = await client.admin.listOrganizations({
			query: {
				limit: "",
				offset: " ",
			},
			fetchOptions: { headers: adminHeaders },
		});
		expect(blankPagination.data?.organizations).toHaveLength(2);
		expect(blankPagination.data?.limit).toBeUndefined();
		expect(blankPagination.data?.offset).toBeUndefined();

		const filtered = await client.admin.listOrganizations({
			query: {
				filterField: "slug",
				filterValue: "alpha-org",
				filterOperator: "eq",
			},
			fetchOptions: { headers: adminHeaders },
		});
		expect(filtered.data?.organizations.map((org) => org.name)).toEqual([
			"Alpha Org",
		]);
	});

	it("does not allow a user without admin organization permission", async () => {
		const result = await client.admin.listOrganizations({
			query: {},
			fetchOptions: { headers: memberHeaders },
		});
		expect(result.error?.status).toBe(403);
	});
});

describe("Admin organization listing configuration", () => {
	it("requires organization() when admin organization endpoints are enabled", async () => {
		const { auth } = await getTestInstance(
			{ plugins: [admin({ organizations: { enabled: true } })] },
			{ disableTestUser: true },
		);
		await expect(auth.$context).rejects.toThrow(
			"The admin organization endpoints require the organization plugin to be enabled.",
		);
	});

	it("does not register the endpoint unless it is enabled", async () => {
		const { auth } = await getTestInstance({
			plugins: [admin(), organization()],
		});
		expect(
			(auth.api as unknown as Record<string, unknown>).adminListOrganizations,
		).toBeUndefined();
		expect(adminClient().pathMethods).not.toHaveProperty(
			"/admin/list-organizations",
		);
		expect(
			adminClient({ organizations: { enabled: true } }).pathMethods,
		).toHaveProperty("/admin/list-organizations", "GET");
	});

	it("honors custom admin organization permissions", async () => {
		const ac = createAccessControl({
			organization: ["admin-list"],
		} as const);
		const allowed = ac.newRole({ organization: ["admin-list"] });
		const blocked = ac.newRole({ organization: [] });
		const { customFetchImpl, signInWithUser } = await getTestInstance({
			plugins: [
				admin({
					organizations: { enabled: true },
					ac,
					roles: { allowed, blocked },
				}),
				organization(),
			],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: {
								...user,
								role: user.name === "Allowed" ? "allowed" : "blocked",
							},
						}),
					},
				},
			},
		});
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [adminClient({ organizations: { enabled: true } })],
			fetchOptions: { customFetchImpl },
		});

		await client.signUp.email({
			email: "allowed@test.com",
			password: "password",
			name: "Allowed",
		});
		await client.signUp.email({
			email: "blocked@test.com",
			password: "password",
			name: "Blocked",
		});
		const { headers: allowedHeaders } = await signInWithUser(
			"allowed@test.com",
			"password",
		);
		const { headers: blockedHeaders } = await signInWithUser(
			"blocked@test.com",
			"password",
		);

		const success = await client.admin.listOrganizations({
			query: {},
			fetchOptions: { headers: allowedHeaders },
		});
		const forbidden = await client.admin.listOrganizations({
			query: {},
			fetchOptions: { headers: blockedHeaders },
		});

		expect(success.data?.organizations).toEqual([]);
		expect(forbidden.error?.status).toBe(403);
	});
});
