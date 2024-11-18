import { int, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
	id: text("id").primaryKey().default(new Date().toISOString()),
	name: text("name"),
	email_address: text("email_address").unique(),
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

export const sessions = sqliteTable("sessions", {
	id: text("id").primaryKey(),
	userId: text("userId").references(() => user.id),
	expiresAt: int("expiresAt", {
		mode: "timestamp",
	}),
});
