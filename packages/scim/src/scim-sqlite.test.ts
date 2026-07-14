import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getMigrations } from "better-auth/db/migration";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

describe("SCIM SQLite integration", () => {
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
								credentials: [{ type: "bearer", token: "sqlite-scim-token" }],
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
					{ value: "first-work@example.com", type: "work" },
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
