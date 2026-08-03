import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_MEDIA_TYPE = "application/scim+json";

function createLegacySCIMUserTable(sqlite: DatabaseSync) {
	sqlite.exec(`
		CREATE TABLE "scimUser" (
			"id" text PRIMARY KEY NOT NULL,
			"connectionId" text NOT NULL,
			"provisioningDomainId" text NOT NULL,
			"userId" text NOT NULL,
			"connectionUserKey" text NOT NULL,
			"userName" text NOT NULL,
			"userNameKey" text NOT NULL,
			"primaryEmail" text NOT NULL,
			"workEmailValueIndex" text NOT NULL,
			"emailValueIndex" text NOT NULL,
			"displayName" text NOT NULL,
			"formattedName" text NOT NULL,
			"givenName" text,
			"familyName" text,
			"serializedEmails" text NOT NULL,
			"externalId" text,
			"externalIdKey" text,
			"active" integer NOT NULL,
			"orderKey" text NOT NULL,
			"createdAt" integer NOT NULL,
			"updatedAt" integer NOT NULL
		);
		INSERT INTO "scimUser" (
			"id", "connectionId", "provisioningDomainId", "userId",
			"connectionUserKey", "userName", "userNameKey", "primaryEmail",
			"workEmailValueIndex", "emailValueIndex", "displayName",
			"formattedName", "givenName", "familyName", "serializedEmails",
			"active", "orderKey", "createdAt", "updatedAt"
		) VALUES (
			'legacy-scim-user', 'legacy', 'legacy', 'legacy-user',
			'legacy:user', 'legacy@example.com', 'legacy:username',
			'legacy@example.com', '|legacy|', '|legacy|', 'Legacy User',
			'Legacy User', 'Legacy', 'User',
			'[{"value":"legacy@example.com","primary":true}]',
			1, 'legacy-order', 0, 0
		);
	`);
}

function createLegacySCIMAuth(sqlite: DatabaseSync) {
	return betterAuth({
		baseURL: "http://localhost:3000",
		database: {
			dialect: new NodeSqliteDialect({ database: sqlite }),
			type: "sqlite",
			transaction: true,
		},
		plugins: [
			scim({
				connections: [
					{
						id: "legacy",
						credentials: [
							{
								type: "bearer",
								id: "legacy-token",
								token: "legacy-token",
							},
						],
					},
				],
			}),
		],
	});
}

describe("SCIM SQLite integration", () => {
	it("adds serializedAttributes as a nullable column that migrates populated legacy rows", async ({
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		onTestFinished(() => sqlite.close());
		createLegacySCIMUserTable(sqlite);
		const auth = createLegacySCIMAuth(sqlite);

		const migrations = await getMigrations(auth.options);
		const scimUserAdditions = migrations.toBeAdded.find(
			(table) => table.table === "scimUser",
		);
		expect(Object.keys(scimUserAdditions?.fields ?? {})).toEqual([
			"serializedAttributes",
		]);
		expect(scimUserAdditions?.fields.serializedAttributes).toMatchObject({
			type: "string",
			required: false,
		});
		const sql = (await migrations.compileMigrations()).toLowerCase();
		expect(sql).toContain('add column "serializedattributes" text');
		expect(sql).not.toMatch(/add column "serializedattributes"[^;]*not null/);

		await expect(migrations.runMigrations()).resolves.not.toThrow();

		const response = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/scim/v2/Users/legacy-scim-user",
				{
					headers: {
						accept: SCIM_MEDIA_TYPE,
						authorization: "Bearer legacy-token",
					},
				},
			),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			userName: "legacy@example.com",
			name: {
				formatted: "Legacy User",
				givenName: "Legacy",
				familyName: "User",
			},
			emails: [{ value: "legacy@example.com", primary: true }],
		});
	});

	it("upgrades a populated legacy table and provisions a new user through the real HTTP endpoint", async ({
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		onTestFinished(() => sqlite.close());
		createLegacySCIMUserTable(sqlite);
		const auth = createLegacySCIMAuth(sqlite);
		const migrations = await getMigrations(auth.options);

		await migrations.runMigrations();

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/scim/v2/Users", {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: "Bearer legacy-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify({
					schemas: [USER_SCHEMA],
					userName: "upgraded@example.com",
					displayName: "Upgraded User",
					name: {
						formatted: "Ms. Upgraded User",
						givenName: "Upgraded",
						familyName: "User",
					},
					emails: [
						{
							value: "upgraded@example.com",
							type: "work",
							primary: true,
						},
					],
					active: true,
				}),
			}),
		);

		expect(response.status).toBe(201);
		const persisted = sqlite
			.prepare(
				`SELECT "formattedName", "givenName", "familyName",
					"serializedEmails", "serializedAttributes"
				FROM "scimUser"
				WHERE "userName" = 'upgraded@example.com'`,
			)
			.get() as
			| {
					formattedName: string;
					givenName: string | null;
					familyName: string | null;
					serializedEmails: string;
					serializedAttributes: string;
			  }
			| undefined;
		expect(persisted).toMatchObject({
			formattedName: "Ms. Upgraded User",
			givenName: "Upgraded",
			familyName: "User",
		});
		expect(JSON.parse(persisted?.serializedEmails ?? "[]")).toEqual([
			{
				value: "upgraded@example.com",
				type: "work",
				primary: true,
			},
		]);
		expect(JSON.parse(persisted?.serializedAttributes ?? "{}")).toMatchObject({
			schemas: [USER_SCHEMA],
			name: {
				formatted: "Ms. Upgraded User",
				givenName: "Upgraded",
				familyName: "User",
			},
			emails: [
				{
					value: "upgraded@example.com",
					type: "work",
					primary: true,
				},
			],
		});
	});

	it("persists and queries canonical resources through a native transaction adapter", async ({
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		onTestFinished(() => sqlite.close());
		const { auth, db } = await getTestInstance(
			{
				database: {
					dialect: new NodeSqliteDialect({ database: sqlite }),
					type: "sqlite",
					transaction: true,
				},
				plugins: [
					scim({
						connections: [
							{
								id: "sqlite-workforce",
								credentials: [
									{
										type: "bearer",
										id: "sqlite-scim-token",
										token: "sqlite-scim-token",
									},
								],
							},
						],
					}),
				],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		const migrations = await getMigrations(auth.options);
		await migrations.runMigrations();
		const headers = { authorization: "Bearer sqlite-scim-token" };

		const user = await auth.api.createSCIMUser({
			body: {
				schemas: [USER_SCHEMA],
				userName: "sqlite-user",
				emails: [
					{
						value: "primary@example.com",
						type: "home",
						primary: true,
					},
					{ value: "first-work@example.com", type: "other" },
					{ value: "second-work@example.com", type: "work" },
				],
			},
			headers,
		});
		const users = await auth.api.listSCIMUsers({
			query: {
				filter: 'emails[type eq "work"].value eq "second-work@example.com"',
			},
			headers,
		});
		expect(users).toMatchObject({
			totalResults: 1,
			Resources: [{ id: user.id }],
		});

		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "SQLite operators",
				members: [{ value: user.id, type: "User" }],
			},
			headers,
		});
		expect(group.members).toEqual([
			expect.objectContaining({ value: user.id, type: "User" }),
		]);
		expect(
			await db.findMany({
				model: "account",
				where: [],
			}),
		).toEqual([]);
	});
});
