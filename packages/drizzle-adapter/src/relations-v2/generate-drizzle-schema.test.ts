import type { BetterAuthOptions } from "@better-auth/core";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { generateDrizzleSchema } from "./generate-drizzle-schema";

const generate = (options: BetterAuthOptions) =>
	generateDrizzleSchema({
		options,
		provider: "pg",
		adapterConfig: { provider: "pg" },
	});

const generateFor = (
	provider: "sqlite" | "mysql" | "pg",
	options: BetterAuthOptions,
) =>
	generateDrizzleSchema({
		options,
		provider,
		adapterConfig: { provider },
	});

/**
 * Type-checks the generated schema and returns its diagnostics, ignoring
 * module-resolution errors for `drizzle-orm` (not resolvable in this sandbox).
 *
 * @see https://github.com/dotansimha/graphql-code-generator/blob/2784ada257836190ded7ca8be290970e3c30fd69/packages/utils/graphql-codegen-testing/src/typescript.ts
 */
function typeErrors(code: string): string[] {
	const fileName = "schema.ts";
	const host = ts.createCompilerHost({});
	const program = ts.createProgram(
		[fileName],
		{ noEmit: true, skipLibCheck: true },
		{
			...host,
			getSourceFile: (name, languageVersion, onError, shouldCreate) =>
				name === fileName
					? ts.createSourceFile(name, code, ts.ScriptTarget.ESNext)
					: host.getSourceFile(name, languageVersion, onError, shouldCreate),
		},
	);
	return ts
		.getPreEmitDiagnostics(program)
		.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
		.filter(
			(message) =>
				!message.includes("Cannot find module") &&
				// `drizzle-orm` may resolve to v0 or v1 depending on what the
				// sandbox has installed. The generator targets Relations v2
				// exports (e.g. `defineRelationsPart`) that don't exist on v0,
				// so suppress those version-dependent member errors. Real
				// structural issues in the generated code (duplicate
				// identifiers, syntax errors, etc.) are still reported.
				!/^Module '"drizzle-orm(\/[\w-]+)?"' has no exported member/.test(
					message,
				),
		);
}

describe("relations-v2 schema generator", () => {
	it("generates valid TypeScript for the default schema", async () => {
		const { code = "" } = await generate({});
		expect(typeErrors(code)).toEqual([]);
	});

	/**
	 * A hardcoded `export const relations = defineRelationsPart(...)` collides
	 * with a user model whose table name is `relations` (e.g.
	 * `verification: { modelName: "relations" }`), producing
	 * `Duplicate identifier 'relations'` and breaking schema compilation.
	 */
	describe("relations part export name", () => {
		it("exports the relations part as `authRelations`, not `relations`", async () => {
			const { code = "" } = await generate({});

			expect(code).toMatch(
				/^export const authRelations\s*=\s*defineRelationsPart\(/m,
			);
			expect(code).not.toMatch(/^export const relations\s*=/m);
		});

		it("compiles without duplicate identifier errors when a model's table name is `relations`", async () => {
			const { code = "" } = await generate({
				verification: { modelName: "relations" },
			});

			expect(typeErrors(code)).toEqual([]);
		});
	});

	/**
	 * Drizzle ORM `>=1.0.0-rc.1` removed the `mode: "json"` option from the
	 * MySQL `text` and `json` column builders. Generating MySQL schemas with
	 * those signatures produces code that fails to compile and crashes
	 * `drizzle-kit push` for any user with `string[]` / `number[]` / `json`
	 * additional fields.
	 */
	it("emits valid Drizzle RC3 MySQL columns for json and array additional fields", async () => {
		const { code = "" } = await generateFor("mysql", {
			user: {
				additionalFields: {
					tags: { type: "string[]" },
					scores: { type: "number[]" },
					metadata: { type: "json" },
				},
			},
		});

		expect(code).not.toMatch(/text\([^)]*mode:\s*["']json["']/);
		expect(code).not.toMatch(/json\([^)]*mode:\s*["']json["']/);
		expect(code).toMatch(/tags:\s*json\(['"]tags['"]\)/);
		expect(code).toMatch(/scores:\s*json\(['"]scores['"]\)/);
		expect(code).toMatch(/metadata:\s*json\(['"]metadata['"]\)/);
		expect(code).toMatch(
			/import\s*\{[^}]*\bjson\b[^}]*\}\s*from\s*["']drizzle-orm\/mysql-core["']/,
		);
	});

	/**
	 * A non-primitive or quote-bearing `defaultValue` must be serialized to a
	 * valid JS literal. Interpolating it directly emits `.default(customer)`
	 * (an undefined identifier), `.default([object Object])` (a syntax error),
	 * or `.default("hello "admin"")` (a broken string literal).
	 *
	 * @see https://github.com/better-auth/better-auth/pull/10048
	 */
	it("serializes array, object, and quoted-string additionalField defaultValue to a literal", async () => {
		const { code = "" } = await generate({
			user: {
				additionalFields: {
					roles: { type: "string[]", defaultValue: ["customer"] },
					scores: { type: "number[]", defaultValue: [1, 2, 3] },
					settings: { type: "json", defaultValue: { theme: "dark" } },
					label: { type: "string", defaultValue: 'hello "admin"' },
				},
			},
		});

		expect(code).toContain('.default(["customer"])');
		expect(code).toContain(".default([1, 2, 3])");
		expect(code).toContain('.default({"theme":"dark"})');
		expect(code).toContain('.default("hello \\"admin\\"")');
		expect(code).not.toMatch(/\.default\(customer\)/);
		expect(code).not.toContain("[object Object]");
		expect(typeErrors(code)).toEqual([]);
	});

	describe("schemaName (PostgreSQL namespace)", () => {
		it("declares a pgSchema and uses schema.table() when schemaName is set", async () => {
			const { code = "" } = await generateDrizzleSchema({
				options: {},
				provider: "pg",
				adapterConfig: { provider: "pg", schemaName: "auth" },
			});

			expect(code).toContain('const authSchema = pgSchema("auth")');
			expect(code).toMatch(
				/import\s*\{[^}]*\bpgSchema\b[^}]*\}\s*from\s*["']drizzle-orm\/pg-core["']/,
			);
			// Tables are namespaced; no bare pgTable() table definitions remain.
			expect(code).toMatch(/export const \w+ = authSchema\.table\(/);
			expect(code).not.toMatch(/export const \w+ = pgTable\(/);
			// Relations still reference the exported table consts unchanged.
			expect(code).toContain("defineRelationsPart(");
			expect(typeErrors(code)).toEqual([]);
		});

		it("does not emit pgSchema when schemaName is undefined", async () => {
			const { code = "" } = await generateDrizzleSchema({
				options: {},
				provider: "pg",
				adapterConfig: { provider: "pg" },
			});

			expect(code).not.toContain("pgSchema(");
			expect(code).toMatch(/export const \w+ = pgTable\(/);
		});

		it("ignores schemaName for non-pg providers", async () => {
			for (const provider of ["sqlite", "mysql"] as const) {
				const { code = "" } = await generateDrizzleSchema({
					options: {},
					provider,
					adapterConfig: { provider, schemaName: "auth" },
				});
				expect(code).not.toContain("pgSchema");
				expect(code).toMatch(
					new RegExp(`export const \\w+ = ${provider}Table\\(`),
				);
			}
		});

		it("converts a hyphenated schemaName into a valid identifier", async () => {
			const { code = "" } = await generateDrizzleSchema({
				options: {},
				provider: "pg",
				adapterConfig: { provider: "pg", schemaName: "my-auth" },
			});

			expect(code).toContain('const myAuthSchema = pgSchema("my-auth")');
			expect(code).toContain("myAuthSchema.table");
			expect(typeErrors(code)).toEqual([]);
		});
	});
});
