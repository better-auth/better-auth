import { test, expect, beforeAll, describe } from "vitest";
import { kyselyAdapter } from "./kysely-adapter";
import { generateId } from "../utils";
import type { Adapter } from "../types";
import { Kysely, SqliteDialect } from "kysely";

describe("Kysely Adapter JOIN Tests", () => {
	let adapter: Adapter;
	let userId: string;
	let sessionId: string;

	beforeAll(async () => {
		// Initialize the adapter with a Kysely instance
		const Database = (await import("better-sqlite3")).default;
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});

		adapter = kyselyAdapter(db);

		// Create necessary tables (manually for testing)
		await db.schema
			.createTable("user")
			.addColumn("id", "text", (col) => col.primaryKey())
			.addColumn("name", "text")
			.addColumn("email", "text")
			.addColumn("emailVerified", "boolean")
			.addColumn("createdAt", "text")
			.addColumn("updatedAt", "text")
			.execute();

		await db.schema
			.createTable("session")
			.addColumn("id", "text", (col) => col.primaryKey())
			.addColumn("userId", "text")
			.addColumn("token", "text")
			.addColumn("expiresAt", "text")
			.addColumn("updatedAt", "text")
			.execute();

		// Create test data
		const testUser = {
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const user = await adapter.create({
			model: "user",
			data: testUser,
		});
		userId = user.id;

		const session = await adapter.create({
			model: "session",
			data: {
				userId: userId,
				token: generateId(),
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
				updatedAt: new Date(),
			},
		});
		sessionId = session.id;
	});

	test("should join tables with left join", async () => {
		// Create a session with a non-existent userId to test LEFT JOIN
		const orphanSession = await adapter.create({
			model: "session",
			data: {
				userId: "non-existent-user",
				token: generateId(),
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
				updatedAt: new Date(),
			},
		});

		const res = await adapter.findMany({
			model: "session",
			where: [{ field: "id", value: orphanSession.id }],
			joins: [
				{
					type: "left",
					table: "user",
					on: { left: "session.userId", right: "user.id" },
					select: ["id", "name", "email"],
				},
			],
		});

		expect(res).toHaveLength(1);
		expect(res[0]).toHaveProperty("userId", "non-existent-user");
		// With LEFT JOIN, user fields should be null/undefined
		expect([null, undefined]).toContain((res[0] as any)["user_id"]);
	});

	test("should join with findOne", async () => {
		const res = await adapter.findOne({
			model: "session",
			where: [{ field: "id", value: sessionId }],
			joins: [
				{
					type: "inner",
					table: "user",
					on: { left: "session.userId", right: "user.id" },
					select: ["id", "name", "email"],
				},
			],
		});

		expect(res).toBeTruthy();
		expect(res).toHaveProperty("userId", userId);
		expect(res).toHaveProperty("user_id", userId);
		expect(res).toHaveProperty("user_name", "Test User");
		expect(res).toHaveProperty("user_email", "test@example.com");
	});
});
