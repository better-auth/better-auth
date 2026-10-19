import { DatabaseSync } from "node:sqlite";
import { runWithTransaction } from "@better-auth/core/context";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { describe, expect, it } from "vitest";
import { apiKey } from ".";

describe("api-key inside an active transaction", async () => {
	const options = {
		database: new DatabaseSync(":memory:"),
		plugins: [apiKey()],
	};
	await (await getMigrations(options)).runMigrations();
	const auth = betterAuth(options);
	const ctx = await auth.$context;
	const user = await ctx.internalAdapter.createUser(
		{ name: "Key owner", email: "key-owner@example.com" },
		{ method: "test" },
	);
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
				await auth.api.updateApiKey({
					body: { keyId: created.id, userId: user.id, name: "renamed" },
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		expect(await keysNamed("original")).toBe(1);
		expect(await keysNamed("renamed")).toBe(0);
	});
});
