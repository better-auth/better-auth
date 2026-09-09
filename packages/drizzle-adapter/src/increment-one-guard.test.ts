import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "./drizzle-adapter";
import { drizzleAdapter as relationsV2Adapter } from "./relations-v2";

const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name"),
	email: text("email"),
	emailVerified: boolean("emailVerified"),
	image: text("image"),
	createdAt: timestamp("createdAt"),
	updatedAt: timestamp("updatedAt"),
	pendingEmail: text("pendingEmail"),
	pendingEmailRequestId: text("pendingEmailRequestId"),
});

/** @see https://github.com/better-auth/better-auth/pull/8916 */
describe.each([
	["default", drizzleAdapter],
	["relations-v2", relationsV2Adapter],
] as const)("%s conditional PostgreSQL updates", (_name, createAdapter) => {
	it("keeps mutable guards on the outer UPDATE as well as the single-row selection", async () => {
		const queries: string[] = [];
		const db = drizzle(
			async (query) => {
				queries.push(query);
				return { rows: [] };
			},
			{ schema: { user } },
		);
		const adapter = createAdapter(db, { provider: "pg", schema: { user } })({
			user: { changeEmail: { enabled: true, strategy: "verification-table" } },
		});
		expect(
			await adapter.incrementOne({
				model: "user",
				where: [
					{ field: "id", value: "owner" },
					{ field: "email", value: "old@example.com" },
					{ field: "pendingEmail", value: "new@example.com" },
					{ field: "pendingEmailRequestId", value: "request" },
				],
				increment: {},
				set: {
					email: "new@example.com",
					pendingEmail: null,
					pendingEmailRequestId: null,
				},
			}),
		).toBeNull();
		expect(queries).toHaveLength(1);
		const query = queries[0]!;
		expect(query).toContain('"user"."id" in (select');
		const outerGuard = query
			.split(/ limit \$\d+\)/)[1]
			?.split(" returning ")[0];
		expect(outerGuard).toBeDefined();
		for (const field of ["email", "pendingEmail", "pendingEmailRequestId"]) {
			expect(outerGuard).toContain(`"user"."${field}" =`);
		}
	});
});
