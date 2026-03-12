import { describe, expect, it, vi } from "vitest";
import { findOrCreateWalletUser } from "./wallet-user";

function createDuplicateKeyError(
	message = "duplicate key value violates unique constraint",
) {
	const error = new Error(message) as Error & { code?: string };
	error.code = "23505";
	return error;
}

function createMockContext() {
	const users: Array<Record<string, unknown>> = [];
	const wallets: Array<Record<string, unknown>> = [];
	const accounts: Array<Record<string, unknown>> = [];

	const adapter = {
		id: "test",
		findOne: vi.fn(async (args: { model: string; where: Array<{ field: string; value: unknown }> }) => {
			const collection =
				args.model === "user"
					? users
					: args.model === "walletAddress"
						? wallets
						: accounts;
			return (
				collection.find((row) =>
					args.where.every(
						(where) => String(row[where.field] ?? "") === String(where.value ?? ""),
					),
				) ?? null
			);
		}),
		create: vi.fn(async (args: { model: string; data: Record<string, unknown> }) => {
			if (args.model !== "walletAddress") {
				throw new Error(`unsupported model ${args.model}`);
			}
			const row = {
				id: String(wallets.length + 1),
				...args.data,
			};
			wallets.push(row);
			return row;
		}),
		transaction: vi.fn(async (callback: (trx: typeof adapter) => Promise<unknown>) =>
			callback(adapter),
		),
	};

	const internalAdapter = {
		createUser: vi.fn(
			async (data: { email: string; name: string; image: string }) => {
				const user = {
					id: String(users.length + 1),
					email: data.email,
					name: data.name,
					image: data.image,
				};
				users.push(user);
				return user;
			},
		),
		findUserByEmail: vi.fn(async (email: string) => {
			const user = users.find((entry) => entry.email === email);
			return user ? { user, accounts: [] } : null;
		}),
		findAccountByProviderId: vi.fn(async (accountId: string, providerId: string) => {
			return (
				accounts.find(
					(entry) =>
						entry.accountId === accountId && entry.providerId === providerId,
				) ?? null
			);
		}),
		createAccount: vi.fn(
			async (data: { userId: string; providerId: string; accountId: string }) => {
				const account = {
					id: String(accounts.length + 1),
					...data,
				};
				accounts.push(account);
				return account;
			},
		),
	};

	return {
		users,
		wallets,
		accounts,
		adapter,
		internalAdapter,
		ctx: {
			context: {
				adapter,
				internalAdapter,
				baseURL: "http://localhost:3000",
			},
		} as any,
	};
}

describe("findOrCreateWalletUser", () => {
	it("creates user, wallet, and account inside a transaction", async () => {
		const { ctx, adapter, users, wallets, accounts } = createMockContext();

		const user = await findOrCreateWalletUser(ctx, {
			walletAddress: "0x000000000000000000000000000000000000dEaD",
			chainId: 1,
			anonymous: true,
		});

		expect(user).not.toBeNull();
		expect(adapter.transaction).toHaveBeenCalledTimes(1);
		expect(users).toHaveLength(1);
		expect(wallets).toHaveLength(1);
		expect(accounts).toHaveLength(1);
		expect(wallets[0]?.userId).toBe(user?.id);
		expect(accounts[0]?.userId).toBe(user?.id);
	});

	it("reuses the existing user when createUser hits a duplicate email race", async () => {
		const { ctx, users, wallets, accounts, internalAdapter } = createMockContext();
		const existingUser = {
			id: "existing-user",
			email: "0x000000000000000000000000000000000000dEaD@http://localhost:3000",
			name: "existing",
			image: "",
		};
		users.push(existingUser);
		internalAdapter.createUser.mockRejectedValueOnce(createDuplicateKeyError());

		const user = await findOrCreateWalletUser(ctx, {
			walletAddress: "0x000000000000000000000000000000000000dEaD",
			chainId: 1,
			anonymous: true,
		});

		expect(user).toEqual(existingUser);
		expect(internalAdapter.findUserByEmail).toHaveBeenCalledWith(
			existingUser.email,
			{ includeAccounts: false },
		);
		expect(wallets).toHaveLength(1);
		expect(wallets[0]?.userId).toBe(existingUser.id);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.userId).toBe(existingUser.id);
	});
});
