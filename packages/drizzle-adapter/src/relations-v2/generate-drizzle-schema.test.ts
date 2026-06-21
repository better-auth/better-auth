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

	// A model named `relations` collides with the hardcoded
	// `export const relations = defineRelationsPart(...)`, producing a duplicate
	// declaration that fails to compile.
	it("generates valid TypeScript when a model's table name is `relations`", async () => {
		const { code = "" } = await generate({
			verification: { modelName: "relations" },
		});
		expect(typeErrors(code)).toEqual([]);
	});

	/**
	 * Drizzle ORM `>=1.0.0-rc.1` removed the `mode: "json"` option from the
	 * MySQL `text` and `json` column builders. Generating MySQL schemas with
	 * those signatures produces code that fails to compile and crashes
	 * `drizzle-kit push` for any user with `string[]` / `number[]` / `json`
	 * additional fields.
	 *
	 * @see https://github.com/better-auth/better-auth/pull/9489#discussion
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
});
