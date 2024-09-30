import { int, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";

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
