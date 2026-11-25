import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { getInsertColumnCount } from "./create-many-utils";

describe("getInsertColumnCount", () => {
	it("counts every table column including omitted defaults", () => {
		const user = sqliteTable("user", {
			id: sqliteText("id").primaryKey(),
			name: sqliteText("name"),
			extra: sqliteText("extra").default("x"),
		});
		expect(getInsertColumnCount(user, [{ id: "a", name: "Ada" }])).toBe(3);
	});
});
