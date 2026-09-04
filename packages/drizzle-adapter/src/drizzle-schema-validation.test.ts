import { SchemaMismatchError } from "@better-auth/core/db/internal";
import type { PgTable } from "drizzle-orm/pg-core";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { drizzleAdapter } from "./drizzle-adapter";

const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
});

const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

/** Every account column Better Auth writes, except `scope`. */
const accountColumns = {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
};

function build(
	account: PgTable,
	options: Parameters<ReturnType<typeof drizzleAdapter>>[0] = {},
) {
	const schema = { user, session, account, verification };
	return () =>
		drizzleAdapter({ _: { fullSchema: schema } } as never, {
			provider: "pg",
			schema,
		})(options);
}

describe("drizzle schema validation", () => {
	it("accepts a schema with every table and column Better Auth writes", () => {
		const account = pgTable("account", {
			...accountColumns,
			scope: text("scope"),
		});
		expect(build(account)).not.toThrow();
	});

	it("reports a column Better Auth writes that the schema lacks", () => {
		const account = pgTable("account", accountColumns);
		expect(build(account)).toThrow(SchemaMismatchError);
		expect(build(account)).toThrow(
			/Column "scope" is missing from table "account"\. Run `npx auth generate`/,
		);
	});

	it("reports a required column Better Auth never writes", () => {
		const account = pgTable("account", {
			...accountColumns,
			scope: text("scope"),
			issuer: text("issuer").notNull(),
		});
		expect(build(account)).toThrow(SchemaMismatchError);
		expect(build(account)).toThrow(
			/Column "issuer" on table "account" is required[\s\S]*account_issuer_accountId_uidx/,
		);
	});

	it("accepts an extra required column that has a default", () => {
		const account = pgTable("account", {
			...accountColumns,
			scope: text("scope"),
			tenant: text("tenant").notNull().default("x"),
		});
		expect(build(account)).not.toThrow();
	});

	it("warns instead of failing when only a plugin table is wrong", () => {
		const account = pgTable("account", {
			...accountColumns,
			scope: text("scope"),
		});
		const log = vi.fn();
		expect(
			build(account, {
				logger: { log },
				plugins: [
					{
						id: "widgets",
						schema: {
							widget: { fields: { name: { type: "string", required: true } } },
						},
					},
				],
			}),
		).not.toThrow();
		expect(log).toHaveBeenCalledWith(
			"warn",
			expect.stringContaining('Table "widget" is missing'),
		);
	});

	it("skips the check when validateSchema is false", () => {
		const account = pgTable("account", accountColumns);
		expect(
			build(account, { advanced: { database: { validateSchema: false } } }),
		).not.toThrow();
	});
});
