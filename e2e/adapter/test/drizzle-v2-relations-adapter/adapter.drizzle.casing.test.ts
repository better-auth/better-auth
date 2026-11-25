import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Table } from "drizzle-orm";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it, onTestFinished } from "vitest";

/**
 * @see https://orm.drizzle.team/docs/v0-v1-changes
 */
describe("generated Relations v2 column casing", () => {
	for (const provider of ["pg", "mysql", "sqlite"] as const) {
		const namespaces = provider === "pg" ? [undefined, "auth"] : [undefined];
		for (const schemaName of namespaces) {
			it.each([false, true])(
				`${provider} (schemaName: ${schemaName}, camelCase: %s) applies casing with Drizzle RC`,
				async (camelCase) => {
					const options = {
						user: {
							modelName: "authUser",
							additionalFields: {
								customName: { type: "string", fieldName: "ExactName" },
								loginCount: { type: "number" },
								largeCount: { type: "number", bigint: true },
								tagNames: { type: "string[]" },
								scoreValues: { type: "number[]" },
								largeValues: { type: "number[]", bigint: true },
								profileData: { type: "json" },
								userRole: { type: ["admin", "member"] },
							},
						},
					} satisfies BetterAuthOptions;
					const adapter = drizzleAdapter(
						{},
						{ provider, camelCase, schemaName },
					)(options);
					const { code } = await adapter.createSchema!(options);
					expect(code).toBeDefined();

					const tempRoot = join(import.meta.dirname, ".tmp");
					await mkdir(tempRoot, { recursive: true });
					const directory = await mkdtemp(join(tempRoot, "casing-"));
					onTestFinished(() => rm(directory, { recursive: true, force: true }));
					const file = join(directory, "schema.ts");
					await writeFile(file, code!);
					const schema = (await import(file)) as {
						authUser: Table;
						session: Table;
					};

					expect(getTableName(schema.authUser)).toBe(
						camelCase ? "authUser" : "auth_user",
					);
					const user = getTableColumns(schema.authUser);
					expect(user.createdAt!.name).toBe(
						camelCase ? "createdAt" : "created_at",
					);
					expect(user.ExactName!.name).toBe("ExactName");
					expect(user.userRole!.name).toBe(
						camelCase ? "userRole" : "user_role",
					);
					expect(getTableColumns(schema.session).userId!.name).toBe(
						camelCase ? "userId" : "user_id",
					);
				},
			);
		}
	}
});
