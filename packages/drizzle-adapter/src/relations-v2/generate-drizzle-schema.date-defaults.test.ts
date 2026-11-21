import type { BetterAuthDBSchema } from "@better-auth/core/db";
import { describe, expect, it, vi } from "vitest";
import { generateDrizzleSchema } from "./generate-drizzle-schema";

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new#syntax
 */
describe.each(["pg", "mysql", "sqlite"] as const)(
	"Drizzle %s date defaults",
	(provider) => {
		it.each([
			{ source: "() => new Date()", current: true },
			{ source: "() => new Date", current: true },
			{ source: "()=>new Date", current: true },
			{ source: "() => new Date(0)", current: false },
			{ source: "() => new Date /* c */ (0)", current: false },
			{ source: "() => new Date // c\n(0)", current: false },
			{ source: "() => new Date /* c */ ('2020-01-01')", current: false },
			{ source: "() => new Date('2020-01-01')", current: false },
			{ source: "() => new Date.prototype.constructor(0)", current: false },
		])(
			"generates the expected default for $source",
			async ({ source, current }) => {
				const defaultValue = Object.assign(
					vi.fn(() => new Date()),
					{
						toString: () => source,
					},
				);
				const tables: BetterAuthDBSchema = {
					event: {
						modelName: "event",
						fields: {
							createdAt: { type: "date", required: true, defaultValue },
						},
					},
				};
				const { code = "" } = await generateDrizzleSchema({
					options: {},
					provider,
					adapterConfig: { provider },
					tables,
				});
				if (provider === "sqlite") {
					expect(
						code.includes("cast(unixepoch('subsecond') * 1000 as integer)"),
					).toBe(current);
					expect(
						/import\s*\{[^}]*\bsql\b[^}]*\}\s*from "drizzle-orm"/.test(code),
					).toBe(current);
				} else {
					expect(code.includes(".defaultNow()")).toBe(current);
				}
				expect(defaultValue).not.toHaveBeenCalled();
			},
		);
	},
);
