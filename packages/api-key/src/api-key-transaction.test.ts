import { DatabaseSync } from "node:sqlite";
import { runWithTransaction } from "@better-auth/core/context";
import type { SecondaryStorage } from "@better-auth/core/db";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { describe, expect, it, vi } from "vitest";
import { apiKey } from ".";

describe("api-key inside an active transaction", async () => {
	const options = {
		database: new DatabaseSync(":memory:"),
		emailAndPassword: { enabled: true },
		plugins: [apiKey()],
	};
	await (await getMigrations(options)).runMigrations();
	const auth = betterAuth(options);
	const ctx = await auth.$context;
	const signUp = await auth.api.signUpEmail({
		body: {
			name: "Key owner",
			email: "key-owner@example.com",
			password: "key-owner-password",
		},
		returnHeaders: true,
	});
	const user = signUp.response.user;
	const headers = new Headers({
		cookie: signUp.headers.get("set-cookie")?.split(";")[0] ?? "",
	});
	const keysNamed = (name: string) =>
		ctx.adapter.count({
			model: "apikey",
			where: [{ field: "name", value: name }],
		});

	it("discards a key created in a transaction that rolls back", async () => {
		await expect(
			runWithTransaction(ctx.adapter, async () => {
				await auth.api.createApiKey({
					body: { userId: user.id, name: "rolled-back" },
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		expect(await keysNamed("rolled-back")).toBe(0);
	});

	it("keeps a key created in a transaction that commits", async () => {
		await runWithTransaction(ctx.adapter, () =>
			auth.api.createApiKey({ body: { userId: user.id, name: "committed" } }),
		);
		expect(await keysNamed("committed")).toBe(1);
	});

	it("discards an update made in a transaction that rolls back", async () => {
		const created = await auth.api.createApiKey({
			body: { userId: user.id, name: "original" },
		});
		await expect(
			runWithTransaction(ctx.adapter, async () => {
				const updated = await auth.api.updateApiKey({
					body: { keyId: created.id, userId: user.id, name: "renamed" },
				});
				expect(updated.name).toBe("renamed");
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		expect(await keysNamed("original")).toBe(1);
		expect(await keysNamed("renamed")).toBe(0);
	});

	it("keeps a key deleted in a transaction that rolls back", async () => {
		const created = await auth.api.createApiKey({
			body: { userId: user.id, name: "survives-delete" },
		});
		await expect(
			runWithTransaction(ctx.adapter, async () => {
				const deleted = await auth.api.deleteApiKey({
					body: { keyId: created.id },
					headers,
				});
				expect(deleted.success).toBe(true);
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		expect(await keysNamed("survives-delete")).toBe(1);
	});
});

describe("api-key deferred cleanup started inside an active transaction", async () => {
	const backgroundTasks: Promise<unknown>[] = [];
	const store = new Map<string, string>();
	const secondaryStorage: SecondaryStorage = {
		get: (key) => store.get(key) ?? null,
		set: (key, value) => {
			store.set(key, value);
		},
		getAndDelete: (key) => {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment: (key) => {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(count));
			return count;
		},
		delete: async (key) => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			store.delete(key);
		},
	};
	const options = {
		database: new DatabaseSync(":memory:"),
		secondaryStorage,
		advanced: {
			backgroundTasks: {
				handler: (task: Promise<unknown>) => {
					backgroundTasks.push(task);
				},
			},
		},
		plugins: [
			apiKey({
				storage: "secondary-storage",
				fallbackToDatabase: true,
				deferUpdates: true,
			}),
		],
	};
	await (await getMigrations(options)).runMigrations();
	const auth = betterAuth(options);
	const ctx = await auth.$context;
	const user = await ctx.internalAdapter.createUser(
		{ name: "Deferred key owner", email: "deferred-key-owner@example.com" },
		{ method: "test" },
	);

	it("deletes an expired key after the transaction has committed", async () => {
		const created = await auth.api.createApiKey({
			body: { userId: user.id },
		});
		await ctx.adapter.update({
			model: "apikey",
			where: [{ field: "id", value: created.id }],
			update: { expiresAt: new Date(Date.now() - 1000) },
		});
		store.clear();
		const result = await runWithTransaction(ctx.adapter, () =>
			auth.api.verifyApiKey({ body: { key: created.key } }),
		);
		expect(result.valid).toBe(false);
		await Promise.all(backgroundTasks);
		expect(
			await ctx.adapter.count({
				model: "apikey",
				where: [{ field: "id", value: created.id }],
			}),
		).toBe(0);
	});
});

describe("api-key with a database-backed secondary storage inside an active transaction", async () => {
	const store = new Map<string, string>();
	const secondaryStorage: SecondaryStorage = {
		get: (key) => store.get(key) ?? null,
		set: (key, value) => {
			store.set(key, value);
		},
		getAndDelete: (key) => {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment: (key) => {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(count));
			return count;
		},
		delete: (key) => {
			store.delete(key);
		},
	};
	const options = {
		database: new DatabaseSync(":memory:"),
		secondaryStorage,
		plugins: [
			apiKey({ storage: "secondary-storage", fallbackToDatabase: true }),
		],
	};
	await (await getMigrations(options)).runMigrations();
	const auth = betterAuth(options);
	const ctx = await auth.$context;
	const user = await ctx.internalAdapter.createUser(
		{ name: "Cached key owner", email: "cached-key-owner@example.com" },
		{ method: "test" },
	);
	const createVerifiedKey = async () => {
		const created = await auth.api.createApiKey({
			body: { userId: user.id },
		});
		await auth.api.verifyApiKey({ body: { key: created.key } });
		return created;
	};

	it("keeps serving a key whose disable rolled back", async () => {
		const created = await createVerifiedKey();
		await expect(
			runWithTransaction(ctx.adapter, async () => {
				await auth.api.updateApiKey({
					body: { keyId: created.id, userId: user.id, enabled: false },
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		const result = await auth.api.verifyApiKey({ body: { key: created.key } });
		expect(result.valid).toBe(true);
	});

	it("keeps a committed update when the cache write fails afterwards", async () => {
		const created = await createVerifiedKey();
		const logError = vi.spyOn(ctx.logger, "error").mockImplementation(() => {});
		const set = vi.spyOn(secondaryStorage, "set").mockImplementation(() => {
			throw new Error("cache unavailable");
		});
		try {
			await runWithTransaction(ctx.adapter, () =>
				auth.api.updateApiKey({
					body: { keyId: created.id, userId: user.id, name: "committed-name" },
				}),
			);
			expect(logError).toHaveBeenCalledWith(
				"Failed to update committed API key in secondary storage",
				expect.any(Error),
			);
		} finally {
			set.mockRestore();
			logError.mockRestore();
		}
		const row = await ctx.adapter.findOne<{ name: string }>({
			model: "apikey",
			where: [{ field: "id", value: created.id }],
		});
		expect(row?.name).toBe("committed-name");
	});

	it("stops serving a key whose disable committed", async () => {
		const created = await createVerifiedKey();
		await runWithTransaction(ctx.adapter, () =>
			auth.api.updateApiKey({
				body: { keyId: created.id, userId: user.id, enabled: false },
			}),
		);
		const result = await auth.api.verifyApiKey({ body: { key: created.key } });
		expect(result.valid).toBe(false);
	});

	it("sees its own disable before the transaction commits", async () => {
		const created = await createVerifiedKey();
		const result = await runWithTransaction(ctx.adapter, async () => {
			await auth.api.updateApiKey({
				body: { keyId: created.id, userId: user.id, enabled: false },
			});
			return auth.api.verifyApiKey({ body: { key: created.key } });
		});
		expect(result.valid).toBe(false);
	});

	it("does not cache a key created in a transaction that rolls back", async () => {
		let createdId = "";
		await expect(
			runWithTransaction(ctx.adapter, async () => {
				const created = await auth.api.createApiKey({
					body: { userId: user.id },
				});
				createdId = created.id;
				await auth.api.verifyApiKey({ body: { key: created.key } });
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		expect([...store.values()].some((value) => value.includes(createdId))).toBe(
			false,
		);
	});
});
