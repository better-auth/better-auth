import { boolean, text, varchar, datetime } from "drizzle-orm/mysql-core";
import { mysqlTable } from "drizzle-orm/mysql-core";

export const user = mysqlTable("user", {
	id: varchar("id", { length: 255 }).primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	email_address: varchar("email_address", { length: 255 }).notNull().unique(),
	emailVerified: boolean("emailVerified").notNull(),
	test: text("test").notNull(),
	image: text("image"),
	createdAt: datetime("createdAt", { mode: "date" }).notNull(), // Use `date` mode
	updatedAt: datetime("updatedAt", { mode: "date" }).notNull(), // Use `date` mode
});

export const sessions = mysqlTable("sessions", {
	id: varchar("id", { length: 255 }).primaryKey(),
	expiresAt: datetime("expiresAt", { mode: "date" }).notNull(), // Use `date` mode
	ipAddress: varchar("ipAddress", { length: 255 }),
	userAgent: varchar("userAgent", { length: 255 }),
	token: varchar("token", { length: 255 }).notNull(),
	createdAt: datetime("createdAt", { mode: "date" }).notNull(), // Use `date` mode
	updatedAt: datetime("updatedAt", { mode: "date" }).notNull(), // Use `date` mode
	userId: varchar("userId", { length: 255 })
		.notNull()
		.references(() => user.id),
});

export const account = mysqlTable("account", {
	id: varchar("id", { length: 255 }).primaryKey(),
	accountId: varchar("accountId", { length: 255 }).notNull(),
	providerId: varchar("providerId", { length: 255 }).notNull(),
	userId: varchar("userId", { length: 255 })
		.notNull()
		.references(() => user.id),
	accessToken: text("accessToken"),
	createdAt: datetime("createdAt", { mode: "date" }).notNull(), // Use `date` mode
	updatedAt: datetime("updatedAt", { mode: "date" }).notNull(), // Use `date` mode
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	accessTokenExpiresAt: datetime("accessTokenExpiresAt", { mode: "date" }),
	refreshTokenExpiresAt: datetime("refreshTokenExpiresAt", { mode: "date" }),
	scope: text("scope"),
	password: text("password"),
});

export const verification = mysqlTable("verification", {
	id: varchar("id", { length: 255 }).primaryKey(),
	identifier: varchar("identifier", { length: 255 }).notNull(),
	value: varchar("value", { length: 255 }).notNull(),
	expiresAt: datetime("expiresAt", { mode: "date" }).notNull(), // Use `date` mode
	createdAt: datetime("createdAt", { mode: "date" }).notNull(), // Use `date` mode
	updatedAt: datetime("updatedAt", { mode: "date" }).notNull(), // Use `date` mode
});
