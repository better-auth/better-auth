import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from ".";

describe("organization creation in database hooks", async () => {
	it("should create organization in user creation after hook within transaction", async () => {
		let hookCalledForTestEmail = false;
		let orgCreated: any = null;
		let errorInHook: any = null;

		const { auth, client, db } = await getTestInstance({
			plugins: [organization()],
			databaseHooks: {
				user: {
					create: {
						after: async (user) => {
							// Only run for our specific test user
							if (user.email !== "test-hook@example.com") {
								return;
							}
							hookCalledForTestEmail = true;
							try {
								// This should work now that the adapter uses getCurrentAdapter
								const org = await auth.api.createOrganization({
									body: {
										name: `${user.email}'s Organization`,
										slug: `org-${user.id.substring(0, 8)}`,
										userId: user.id,
									},
								});
								orgCreated = org;
							} catch (error) {
								errorInHook = error;
								throw error;
							}
						},
					},
				},
			},
		});

		// Create a user which should trigger the hook
		const result = await client.signUp.email({
			email: "test-hook@example.com",
			password: "password123",
			name: "Test Hook User",
		});

		// Verify the user was created
		expect(result.data).toBeDefined();
		expect(result.data?.user).toBeDefined();
		expect(result.data?.user?.email).toBe("test-hook@example.com");

		// Verify the hook was called
		expect(hookCalledForTestEmail).toBe(true);

		expect(errorInHook).toBeNull();

		// Verify organization was created successfully
		expect(orgCreated).not.toBeNull();
		expect(orgCreated?.name).toBe("test-hook@example.com's Organization");
		expect(orgCreated?.slug).toMatch(/^org-/);

		// Verify the organization exists in the database
		const orgs = await db.findMany({
			model: "organization",
		});
		// Should have the test user's org from getTestInstance plus our new one
		expect(orgs.length).toBeGreaterThanOrEqual(1);

		const createdOrg = orgs.find((o: any) => o.slug?.startsWith("org-"));
		expect(createdOrg).toBeDefined();
		expect((createdOrg as any)?.name).toBe(
			"test-hook@example.com's Organization",
		);

		// Verify the user is a member of the organization
		const members = await db.findMany({
			model: "member",
			where: [
				{
					field: "organizationId",
					value: orgCreated?.id,
				},
			],
		});
		expect(members).toHaveLength(1);
		expect(members[0]).toMatchObject({
			userId: result.data?.user?.id,
			organizationId: orgCreated?.id,
			role: "owner",
		});
	});

	it("should handle errors gracefully when organization creation fails in hook", async ({
		skip,
	}) => {
		let firstUserCreated = false;
		let errorOnSecondUser: any = null;

		const { auth, client, db } = await getTestInstance({
			plugins: [organization()],
			databaseHooks: {
				user: {
					create: {
						after: async (user) => {
							// Skip test instance default user
							if (!user.email?.includes("-hook@")) {
								return;
							}
							// Try to create an org with duplicate slug (will fail on second user)
							await auth.api.createOrganization({
								body: {
									name: "Test Org",
									slug: "duplicate-test-org", // Same slug for all users
									userId: user.id,
								},
							});
							if (!firstUserCreated) {
								firstUserCreated = true;
							}
						},
					},
				},
			},
		});

		if (!db.options?.adapterConfig.transaction) {
			skip(
				"Skipping since transactions are enabled and will rollback automatically",
			);
		}

		// First user should succeed
		const result1 = await client.signUp.email({
			email: "user1-hook@example.com",
			password: "password123",
			name: "User 1",
		});
		expect(result1.data).toBeDefined();
		expect(result1.data?.user?.email).toBe("user1-hook@example.com");
		expect(firstUserCreated).toBe(true);

		// Second user should fail due to duplicate org slug
		try {
			await client.signUp.email({
				email: "user2-hook@example.com",
				password: "password123",
				name: "User 2",
			});
		} catch (error) {
			errorOnSecondUser = error;
		}

		expect(errorOnSecondUser).toBeDefined();

		// Verify only one organization with our test slug was created
		const orgs = await db.findMany({
			model: "organization",
			where: [
				{
					field: "slug",
					value: "duplicate-test-org",
				},
			],
		});
		expect(orgs).toHaveLength(1);

		// Verify only the first user exists (transaction should have rolled back for second user)
		const users = await db.findMany({
			model: "user",
			where: [
				{
					field: "email",
					value: "user2-hook@example.com",
				},
			],
		});
		expect(users).toHaveLength(0);
	});

	it("should work with multiple async operations in the hook", async () => {
		let asyncOperationsCompleted = 0;
		let foundUserInTransaction = false;

		const { auth, client, db } = await getTestInstance({
			plugins: [organization()],
			databaseHooks: {
				user: {
					create: {
						after: async (user, ctx): Promise<any> => {
							// Skip test instance default user
							if (user.email !== "async-hook@example.com") {
								return;
							}
							// Simulate some async operation
							await new Promise((resolve) => setTimeout(resolve, 10));
							asyncOperationsCompleted++;

							// Check if user exists in the transaction context
							// This should work because we're in the same transaction
							const foundUser =
								await ctx?.context?.internalAdapter?.findUserById?.(user.id);
							foundUserInTransaction = !!foundUser;

							// Create organization
							const org = await auth.api.createOrganization({
								body: {
									name: `Async Org for ${user.name}`,
									slug: `async-${user.id.substring(0, 8)}`,
									userId: user.id,
								},
							});

							// Another async operation
							await new Promise((resolve) => setTimeout(resolve, 10));
							asyncOperationsCompleted++;

							return org;
						},
					},
				},
			},
		});

		const result = await client.signUp.email({
			email: "async-hook@example.com",
			password: "password123",
			name: "Async User",
		});

		expect(result.data).toBeDefined();
		expect(result.data?.user?.email).toBe("async-hook@example.com");

		// Verify async operations completed
		expect(asyncOperationsCompleted).toBe(2);
		expect(foundUserInTransaction).toBe(true);

		// Verify organization was created
		const orgs = await db.findMany({
			model: "organization",
			where: [
				{
					field: "slug",
					operator: "contains",
					value: "async-",
				},
			],
		});
		expect(orgs.length).toBeGreaterThanOrEqual(1);

		const asyncOrg = orgs.find((o: any) => o.name?.includes("Async Org"));
		expect(asyncOrg).toBeDefined();
		expect((asyncOrg as any)?.name).toBe("Async Org for Async User");
	});

	it("should work when creating organization from before hook", async () => {
		let orgId: string | null = null;

		const { auth, client, db } = await getTestInstance({
			plugins: [organization()],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => {
							// We can't create the org here since user doesn't have an ID yet
							// But we can prepare the data
							return {
								data: {
									...user,
									image: "prepared-in-before-hook",
								},
							};
						},
						after: async (user) => {
							// Skip test instance default user
							if (user.email !== "before-hook@example.com") {
								return;
							}
							// Now we can create the org with the user ID
							const org = await auth.api.createOrganization({
								body: {
									name: `Before-After Org`,
									slug: `before-after-${user.id.substring(0, 8)}`,
									userId: user.id,
								},
							});
							orgId = org?.id || null;
						},
					},
				},
			},
		});

		const result = await client.signUp.email({
			email: "before-hook@example.com",
			password: "password123",
			name: "Before Hook User",
		});

		expect(result.data).toBeDefined();
		expect(result.data?.user?.image).toBe("prepared-in-before-hook");
		expect(orgId).not.toBeNull();

		// Verify organization was created
		const org = await db.findOne({
			model: "organization",
			where: [
				{
					field: "id",
					value: orgId!,
				},
			],
		});
		expect(org).toBeDefined();
		expect((org as any)?.name).toBe("Before-After Org");
	});
});
