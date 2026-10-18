import { APIError } from "@better-auth/core/error";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from "./admin";
import { adminClient } from "./client";
import { ADMIN_ERROR_CODES } from "./error-codes";

/**
 * Tests for the admin `create-user` endpoint's transactional behavior
 * @see https://github.com/better-auth/better-auth/issues/11898
 *
 * The admin `create-user` endpoint creates the user and, when a password is
 * provided, its credential account. Both writes must happen inside a single
 * transaction, so a failure rolls both back instead of leaving a committed
 * user with no sign-in method (the email would then be taken and the user
 * orphaned).
 */
describe("admin create-user transaction", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const setup = async () => {
		const { auth, signInWithTestUser, customFetchImpl, db } =
			await getTestInstance(
				{
					plugins: [admin()],
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
				{
					testUser: { name: "Admin" },
				},
			);
		const client = createAuthClient({
			fetchOptions: { customFetchImpl },
			plugins: [adminClient()],
			baseURL: "http://localhost:3000",
		});
		const { headers } = await signInWithTestUser();
		return { auth, db, client, headers };
	};

	/**
	 * Verifies both the user and credential account inserts happen inside a
	 * single transaction.
	 */
	it("runs the user and credential account inserts in a single transaction", async () => {
		const { auth, client, headers } = await setup();
		const ctx = await auth.$context;
		const transaction = ctx.adapter.transaction;
		let transactionCalls = 0;
		vi.spyOn(ctx.adapter, "transaction").mockImplementation((cb) => {
			transactionCalls++;
			return transaction(cb);
		});

		const res = await client.admin.createUser(
			{
				name: "Tx User",
				email: "tx-user@email.com",
				password: "password123",
				role: "user",
			},
			{ headers },
		);
		expect(res.data?.user?.email).toBe("tx-user@email.com");
		expect(transactionCalls).toBe(1);

		const created = res.data?.user;
		if (!created) return;
		await expect(
			ctx.internalAdapter.findCredentialAccount(created.id),
		).resolves.toMatchObject({
			userId: created.id,
			providerId: "credential",
		});
	});

	/**
	 * Verifies that when the credential account insert fails, the already
	 * created user is rolled back instead of being left orphaned with a taken
	 * email.
	 */
	it("rolls back the user when the credential account insert fails", async () => {
		const { auth, db, client, headers } = await setup();
		const ctx = await auth.$context;
		const transaction = ctx.adapter.transaction;
		vi.spyOn(ctx.adapter, "transaction").mockImplementation((cb) =>
			transaction(async (trx) => {
				await cb(trx);
				throw APIError.from("INTERNAL_SERVER_ERROR", {
					code: "TEST_ACCOUNT_INSERT_FAILED",
					message: "injected account insert failure",
				});
			}),
		);

		const res = await client.admin.createUser(
			{
				name: "Orphan User",
				email: "orphan-user@email.com",
				password: "password123",
				role: "user",
			},
			{ headers },
		);
		expect(res.error?.code).toBe("TEST_ACCOUNT_INSERT_FAILED");

		const users = await db.findMany<{ email: string }>({ model: "user" });
		expect(
			users.find((u) => u.email === "orphan-user@email.com"),
		).toBeUndefined();
	});

	/**
	 * Verifies that when the credential account is not created (e.g. an
	 * account.create.before hook returns `false`), the already-created user is
	 * rolled back instead of being committed without a sign-in method.
	 */
	it("rolls back the user when the credential account is not created", async () => {
		const { auth, db, client, headers } = await setup();
		const ctx = await auth.$context;
		// Simulate a create.before hook veto: linkAccount returns null.
		vi.spyOn(ctx.internalAdapter, "linkAccount").mockResolvedValue(
			null as never,
		);

		const res = await client.admin.createUser(
			{
				name: "Vetoed User",
				email: "vetoed-user@email.com",
				password: "password123",
				role: "user",
			},
			{ headers },
		);
		expect(res.error?.code).toBe(ADMIN_ERROR_CODES.FAILED_TO_CREATE_USER.code);

		const users = await db.findMany<{ email: string }>({ model: "user" });
		expect(
			users.find((u) => u.email === "vetoed-user@email.com"),
		).toBeUndefined();
	});
});
