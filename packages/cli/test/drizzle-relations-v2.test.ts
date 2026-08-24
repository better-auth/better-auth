import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { describe, expect, it } from "vitest";
import { generateDrizzleSchema } from "../src/generators/drizzle";

/**
 * @see https://github.com/better-auth/better-auth/issues/10924
 *
 * Drizzle 1.0 removed the `relations()` API in favor of `defineRelations`/
 * `defineRelationsPart`. The generator must detect an installed drizzle-orm
 * 1.0+ and emit code that compiles against it, instead of always emitting
 * the old `relations()` form.
 */
describe("drizzle schema generation for drizzle-orm 1.0", () => {
	function withTmpProject(
		packageJson: Record<string, unknown>,
		run: (cwd: string) => Promise<void>,
	) {
		const tmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "drizzle-relations-v2-test-"),
		);
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify(packageJson),
		);
		return run(tmpDir).finally(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
	}

	it("emits defineRelationsPart when drizzle-orm 1.0 (rc) is installed", async () => {
		await withTmpProject(
			{ dependencies: { "drizzle-orm": "1.0.0-rc.4" } },
			async (cwd) => {
				const schema = await generateDrizzleSchema({
					file: "test.drizzle",
					cwd,
					adapter: drizzleAdapter(
						{},
						{ provider: "sqlite", schema: {} },
					)({} as BetterAuthOptions),
					options: {
						database: drizzleAdapter({}, { provider: "sqlite", schema: {} }),
						plugins: [],
					},
				});

				expect(schema.code).toContain(
					'import { defineRelationsPart, sql } from "drizzle-orm"',
				);
				expect(schema.code).not.toContain("relations(");

				expect(schema.code).toContain(
					"export const authRelations = defineRelationsPart(",
				);
				// Forward "many" side: user -> sessions
				expect(schema.code).toMatch(
					/sessions:\s*r\.many\.session\(\{\s*from:\s*r\.user\.id,\s*to:\s*r\.session\.userId,/,
				);
				// Reverse "one" side: session -> user
				expect(schema.code).toMatch(
					/user:\s*r\.one\.user\(\{\s*from:\s*r\.session\.userId,\s*to:\s*r\.user\.id,/,
				);
			},
		);
	});

	it("keeps emitting the classic relations() API when drizzle-orm is <1.0", async () => {
		await withTmpProject(
			{ dependencies: { "drizzle-orm": "^0.45.2" } },
			async (cwd) => {
				const schema = await generateDrizzleSchema({
					file: "test.drizzle",
					cwd,
					adapter: drizzleAdapter(
						{},
						{ provider: "sqlite", schema: {} },
					)({} as BetterAuthOptions),
					options: {
						database: drizzleAdapter({}, { provider: "sqlite", schema: {} }),
						plugins: [],
					},
				});

				expect(schema.code).toContain("import { relations, sql }");
				expect(schema.code).not.toContain("defineRelationsPart");
				expect(schema.code).toContain(
					"export const userRelations = relations(user,",
				);
			},
		);
	});

	it("keeps emitting the classic relations() API when no cwd is provided", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{ provider: "sqlite", schema: {} },
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter({}, { provider: "sqlite", schema: {} }),
				plugins: [],
			},
		});

		expect(schema.code).toContain("import { relations, sql }");
		expect(schema.code).not.toContain("defineRelationsPart");
	});

	// Minimal plugin that reproduces the two-FKs-to-the-same-model bug from
	// the classic API: two fields on the same table referencing "user".
	const testPlugin = (): BetterAuthPlugin => ({
		id: "test",
		schema: {
			test: {
				fields: {
					userId: {
						type: "string",
						required: false,
						references: { model: "user", field: "id", onDelete: "set null" },
					},
					managerId: {
						type: "string",
						required: false,
						references: { model: "user", field: "id", onDelete: "set null" },
					},
				},
			},
		},
	});

	it("disambiguates duplicate relations to the same model without relationName", async () => {
		await withTmpProject(
			{ dependencies: { "drizzle-orm": "1.0.0-rc.4" } },
			async (cwd) => {
				const schema = await generateDrizzleSchema({
					file: "test.drizzle",
					cwd,
					adapter: drizzleAdapter(
						{},
						{ provider: "sqlite", schema: {} },
					)({} as BetterAuthOptions),
					options: {
						database: drizzleAdapter({}, { provider: "sqlite", schema: {} }),
						plugins: [testPlugin()],
					},
				});

				// Distinct keys alone disambiguate — no `relationName`/alias needed.
				expect(schema.code).not.toContain("relationName");
				expect(schema.code).toMatch(
					/testsByUserId:\s*r\.many\.test\(\{\s*from:\s*r\.user\.id,\s*to:\s*r\.test\.userId,/,
				);
				expect(schema.code).toMatch(
					/testsByManagerId:\s*r\.many\.test\(\{\s*from:\s*r\.user\.id,\s*to:\s*r\.test\.managerId,/,
				);
				expect(schema.code).toMatch(
					/user:\s*r\.one\.user\(\{\s*from:\s*r\.test\.userId,\s*to:\s*r\.user\.id,/,
				);
				expect(schema.code).toMatch(
					/manager:\s*r\.one\.user\(\{\s*from:\s*r\.test\.managerId,\s*to:\s*r\.user\.id,/,
				);
			},
		);
	});
});
