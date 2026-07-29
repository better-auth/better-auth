import type { BetterAuthOptions } from "@better-auth/core";
import type { BetterAuthDBSchema } from "@better-auth/core/db";
import { getAuthTables } from "@better-auth/core/db";
import type { CustomAdapter, DBAdapter } from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import { describe, expect, it } from "vitest";
import { getBaseAdapter } from "./adapter-base";

function createStubCustomAdapter(): CustomAdapter {
	return {
		create: async <T extends Record<string, unknown>>({ data }: { data: T }) =>
			data,
		update: async () => null,
		updateMany: async () => 0,
		findOne: async () => null,
		findMany: async () => [],
		delete: async () => {},
		deleteMany: async () => 0,
		consumeOne: async () => null,
		incrementOne: async () => null,
		count: async () => 0,
	};
}

describe("getBaseAdapter auth-owned schema", () => {
	it("injects host tables into the adapter factory", async () => {
		const options: BetterAuthOptions = {
			user: {
				fields: {
					email: "email_address",
				},
			},
		};
		let receivedTables: BetterAuthDBSchema | undefined;

		const database = (
			opts: BetterAuthOptions,
			tables?: BetterAuthDBSchema,
		): DBAdapter<BetterAuthOptions> => {
			receivedTables = tables;
			return createAdapterFactory({
				config: {
					adapterId: "stub",
					adapterName: "Stub Adapter",
				},
				adapter: () => createStubCustomAdapter(),
			})(opts, tables);
		};

		const adapter = await getBaseAdapter({ ...options, database }, async () => {
			throw new Error("direct database path should not run");
		});

		const hostTables = getAuthTables(options);
		expect(receivedTables).toBeDefined();
		expect(Object.keys(receivedTables!.user!.fields)).toEqual(
			Object.keys(hostTables.user!.fields),
		);
		expect(adapter.options?.authTables).toBe(receivedTables);
		expect(adapter.options?.authTables?.user?.fields.email?.fieldName).toBe(
			"email_address",
		);
	});
});
