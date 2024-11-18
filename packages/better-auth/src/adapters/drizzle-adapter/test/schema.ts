import { boolean, text } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey().default(new Date().toISOString()),
	name: text("name"),
	email_address: text("email_address").unique(),
	emailVerified: boolean("emailVerified"),
	createdAt: boolean("createdAt"),
	updatedAt: boolean("updatedAt"),
});

export const sessions = pgTable("sessions", {
	id: text("id").primaryKey(),
	userId: text("userId").references(() => user.id),
	expiresAt: boolean("expiresAt"),
});
