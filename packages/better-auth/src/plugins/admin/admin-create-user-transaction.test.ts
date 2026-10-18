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
	 * single transaction, in order.
	 */
	it("runs the user and credential account inserts in a single transaction", async () => {
		const { auth, client, headers } = await setup();
		const ctx = await auth.$context;
		const adapter = ctx.adapter as any;
		const origTransaction = adapter.transaction;
		const modelsInTrx: string[] = [];
		let transactionCalls = 0;
		vi.spyOn(adapter, "transaction").mockImplementation(async (cb: any) => {
			transactionCalls++;
			return origTransaction(async (trx: any) => {
				const origCreate = trx.create;
				vi.spyOn(trx, "create").mockImplementation(async (args: any) => {
					modelsInTrx.push(args?.model);
					return origCreate.call(trx, args);
				});
				return cb(trx);
			});
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
		expect(modelsInTrx).toEqual(["user", "account"]);
	});

	/**
	 * Verifies that when the credential account insert fails, the already
	 * created user is rolled back instead of being left orphaned with a taken
	 * email.
	 */
	it("rolls back the user when the credential account insert fails", async () => {
		const { auth, db, client, headers } = await setup();
		const ctx = await auth.$context;
		const adapter = ctx.adapter as any;
		const origTransaction = adapter.transaction;
		vi.spyOn(adapter, "transaction").mockImplementation(async (cb: any) => {
			return origTransaction(async (trx: any) => {
				const origCreate = trx.create;
				vi.spyOn(trx, "create").mockImplementation(async (args: any) => {
					if (args?.model === "account") {
						throw APIError.from("INTERNAL_SERVER_ERROR", {
							code: "TEST_ACCOUNT_INSERT_FAILED",
							message: "injected account insert failure",
						});
					}
					return origCreate.call(trx, args);
				});
				return cb(trx);
			});
		});

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

		const users = await db.findMany({
			model: "user",
			where: [{ field: "email", value: "orphan-user@email.com" }],
		});
		expect(users).toHaveLength(0);
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
		vi.spyOn(ctx.internalAdapter, "linkAccount").mockResolvedValue(null as any);

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

		const users = await db.findMany({
			model: "user",
			where: [{ field: "email", value: "vetoed-user@email.com" }],
		});
		expect(users).toHaveLength(0);
	});
});
