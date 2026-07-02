import { describe, expect, it } from "vitest";
import {
	diffSchemas,
	isSchemaDiffEmpty,
	renderSchemaDiffBox,
} from "../src/commands/upgrade";

const field = (type: string) => ({ type });

describe("diffSchemas", () => {
	it("detects a newly created table", () => {
		const before = {
			user: { fields: { id: field("string") }, order: 1 },
		};
		const after = {
			user: { fields: { id: field("string") }, order: 1 },
			passkey: { fields: { id: field("string") }, order: 2 },
		};
		const diff = diffSchemas(before, after);
		expect(diff.createdTables).toHaveLength(1);
		expect(diff.createdTables[0]?.table).toBe("passkey");
		expect(diff.createdTables[0]?.fields).toContainEqual({
			name: "id",
			type: "string",
		});
		expect(isSchemaDiffEmpty(diff)).toBe(false);
	});

	it("detects added, removed, and type-changed fields", () => {
		const before = {
			user: {
				fields: {
					id: field("string"),
					age: field("number"),
					legacy: field("string"),
				},
			},
		};
		const after = {
			user: {
				fields: {
					id: field("string"),
					age: field("string"),
					email: field("string"),
				},
			},
		};
		const diff = diffSchemas(before, after);
		expect(diff.changedTables).toHaveLength(1);
		const t = diff.changedTables[0]!;
		expect(t.addedFields).toEqual([{ name: "email", type: "string" }]);
		expect(t.removedFields).toEqual([{ name: "legacy", type: "string" }]);
		expect(t.changedFields).toEqual([
			{ name: "age", from: "number", to: "string" },
		]);
	});

	it("detects a removed table", () => {
		const before = {
			user: { fields: { id: field("string") } },
			old: { fields: { id: field("string") } },
		};
		const after = {
			user: { fields: { id: field("string") } },
		};
		const diff = diffSchemas(before, after);
		expect(diff.removedTables).toHaveLength(1);
		expect(diff.removedTables[0]?.table).toBe("old");
	});

	it("reports no changes for identical schemas", () => {
		const schema = {
			user: { fields: { id: field("string"), name: field("string") } },
		};
		const diff = diffSchemas(schema, schema);
		expect(isSchemaDiffEmpty(diff)).toBe(true);
	});
});

describe("renderSchemaDiffBox", () => {
	const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

	it("renders table and field names within a box", () => {
		const diff = diffSchemas(
			{ user: { fields: { id: field("string") } } },
			{
				user: { fields: { id: field("string"), email: field("string") } },
				passkey: { fields: { id: field("string") } },
			},
		);
		const out = stripAnsi(renderSchemaDiffBox(diff));
		expect(out).toContain("Schema changes from upgrade");
		expect(out).toContain("+ passkey");
		expect(out).toContain("+ email");
		expect(out).toContain("┌");
		expect(out).toContain("┐");
		expect(out).toContain("└");
		expect(out).toContain("┘");
	});

	it("pads every body row to an equal visible width", () => {
		const diff = diffSchemas(
			{},
			{ session: { fields: { token: field("string") } } },
		);
		const rows = stripAnsi(renderSchemaDiffBox(diff))
			.split("\n")
			.filter((l) => l.startsWith("│"));
		const widths = new Set(rows.map((r) => r.length));
		expect(widths.size).toBe(1);
	});
});
