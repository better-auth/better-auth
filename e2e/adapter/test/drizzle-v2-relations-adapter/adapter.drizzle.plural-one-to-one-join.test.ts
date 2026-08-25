import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import Database from "better-sqlite3";
import { defineRelationsPart } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { expect, onTestFinished, test } from "vitest";

const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

const sessions = sqliteTable("sessions", {
	id: text("id").primaryKey(),
	token: text("token").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

const dbSchema = { users, sessions };
const generatedAuthRelations = defineRelationsPart(dbSchema, (relations) => ({
	users: {
		sessions: relations.many.sessions({
			from: relations.users.id,
			to: relations.sessions.userId,
		}),
	},
	sessions: {
		user: relations.one.users({
			from: relations.sessions.userId,
			to: relations.users.id,
		}),
	},
}));

const legacyAuthRelations = defineRelationsPart(dbSchema, (relations) => ({
	users: {
		sessions: relations.many.sessions({
			from: relations.users.id,
			to: relations.sessions.userId,
		}),
	},
	sessions: {
		users: relations.one.users({
			from: relations.sessions.userId,
			to: relations.users.id,
		}),
	},
}));

type SessionWithUser = {
	id: string;
	user: { id: string };
};

test.for([
	{
		method: "findOne",
		relationKeys: "generated singular",
		schemaSetup: "with adapter schema",
		relations: generatedAuthRelations,
	},
	{
		method: "findMany",
		relationKeys: "generated singular",
		schemaSetup: "with adapter schema",
		relations: generatedAuthRelations,
	},
	{
		method: "findOne",
		relationKeys: "legacy plural",
		schemaSetup: "with adapter schema",
		relations: legacyAuthRelations,
	},
	{
		method: "findMany",
		relationKeys: "legacy plural",
		schemaSetup: "with adapter schema",
		relations: legacyAuthRelations,
	},
	{
		method: "findOne",
		relationKeys: "generated singular",
		schemaSetup: "without adapter schema",
		relations: generatedAuthRelations,
	},
	{
		method: "findMany",
		relationKeys: "generated singular",
		schemaSetup: "without adapter schema",
		relations: generatedAuthRelations,
	},
	{
		method: "findOne",
		relationKeys: "legacy plural",
		schemaSetup: "without adapter schema",
		relations: legacyAuthRelations,
	},
	{
		method: "findMany",
		relationKeys: "legacy plural",
		schemaSetup: "without adapter schema",
		relations: legacyAuthRelations,
	},
] as const)("$method resolves a one-to-one relation with $relationKeys keys $schemaSetup", async ({
	method,
	schemaSetup,
	relations,
}) => {
	const sqliteDb = new Database(":memory:");
	onTestFinished(() => {
		sqliteDb.close();
	});

	const timestamp = 1_700_000_000_000;
	sqliteDb.exec(`
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			email_verified INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE sessions (
			id TEXT PRIMARY KEY,
			token TEXT NOT NULL,
			expires_at INTEGER NOT NULL,
			user_id TEXT NOT NULL REFERENCES users(id),
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		INSERT INTO users (
			id, name, email, email_verified, created_at, updated_at
		) VALUES (
			'user-1', 'User', 'user@example.com', 0, ${timestamp}, ${timestamp}
		);
		INSERT INTO sessions (
			id, token, expires_at, user_id, created_at, updated_at
		) VALUES (
			'session-1', 'token-1', ${timestamp + 60_000},
			'user-1', ${timestamp}, ${timestamp}
		);
	`);

	const db = drizzle({ client: sqliteDb, relations });
	const adapter = drizzleAdapter(db, {
		...(schemaSetup === "with adapter schema"
			? { schema: { ...dbSchema, authRelations: relations } }
			: {}),
		provider: "sqlite",
		usePlural: true,
	})({
		advanced: { database: { joins: true } },
	});

	const session =
		method === "findOne"
			? await adapter.findOne<SessionWithUser>({
					model: "session",
					where: [{ field: "token", value: "token-1" }],
					join: { user: true },
				})
			: (
					await adapter.findMany<SessionWithUser>({
						model: "session",
						where: [{ field: "token", value: "token-1" }],
						join: { user: true },
					})
				)[0];

	expect(session).toMatchObject({
		id: "session-1",
		user: { id: "user-1" },
	});
});
