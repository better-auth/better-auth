import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { generateDrizzleSchema } from "./generate-drizzle-schema";

// The generator emits a hardcoded `export const relations = defineRelationsPart(...)`.
// A model whose table name is `relations` adds a second `export const relations`,
// producing a duplicate top-level declaration that won't compile.
describe("relations-v2 schema generator: export name collisions", () => {
	const generate = (options: BetterAuthOptions) =>
		generateDrizzleSchema({
			options,
			provider: "pg",
			adapterConfig: { provider: "pg" },
		});

	const duplicateExports = (code: string) => {
		const names = [...code.matchAll(/^export const (\w+)\b/gm)].map(
			(m) => m[1],
		);
		return names.filter((name, index) => names.indexOf(name) !== index);
	};

	it("emits unique top-level declarations for the default schema", async () => {
		const { code } = await generate({});
		expect(duplicateExports(code ?? "")).toEqual([]);
	});

	it("does not collide when a model's table name is `relations`", async () => {
		const { code } = await generate({
			verification: { modelName: "relations" },
		});
		expect(duplicateExports(code ?? "")).toEqual([]);
	});
});
