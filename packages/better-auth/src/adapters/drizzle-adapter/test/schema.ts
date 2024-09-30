import { int, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";

export var user = sqliteTable("user", {
	id: text("id").primaryKey().default(new Date().toISOString()),
	name: text("name"),
	email: text("email").unique(),
	emailVerified: int("emailVerified", {
		mode: "boolean",
	}),
	createdAt: int("createdAt", {
		mode: "timestamp",
	}),
	updatedAt: int("updatedAt", {
		mode: "timestamp",
	}),
});
