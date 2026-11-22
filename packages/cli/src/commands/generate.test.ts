import { describe, expect, it } from "vitest";
import { getDefaultSchemaOutputFileName } from "./generate";

/** @see https://github.com/better-auth/better-auth/issues/12088 */
describe("generate output file name for a directory", () => {
	const now = new Date("2026-01-02T03:04:05.000Z");

	it.each(["kysely", "dsql"])("writes %s migrations to a .sql file", (id) => {
		expect(getDefaultSchemaOutputFileName(id, now)).toBe(
			"2026-01-02T03-04-05.000Z.sql",
		);
	});

	it("keeps the existing names for other adapters", () => {
		expect(getDefaultSchemaOutputFileName("prisma", now)).toBe("schema.prisma");
		expect(getDefaultSchemaOutputFileName("drizzle", now)).toBe(
			"auth-schema.ts",
		);
	});
});
