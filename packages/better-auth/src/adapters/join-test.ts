import { expect, test, beforeAll } from "vitest";
import type { Adapter, BetterAuthOptions } from "../types";
import { generateId } from "../utils";

export interface JoinAdapterTestOptions {
	getAdapter: (options?: any) => Promise<Adapter>;
	testPrefix?: string;
	disabledTests?: Partial<Record<string, boolean>>;
	tableNames?: {
		user?: string;
		session?: string;
	};
	fieldMappings?: {
		userEmail?: string;
		sessionToken?: string;
	};
}

const joinAdapterTests = {
	SHOULD_JOIN_TABLES_WITH_INNER_JOIN: "should join tables with inner join",
	SHOULD_JOIN_TABLES_WITH_LEFT_JOIN: "should join tables with left join",
	SHOULD_JOIN_TABLES_WITH_RIGHT_JOIN: "should join tables with right join",
	SHOULD_JOIN_TABLES_WITH_FULL_JOIN: "should join tables with full join",
	SHOULD_SELECT_SPECIFIC_FIELDS_FROM_JOINED_TABLE:
		"should select specific fields from joined table",
	SHOULD_JOIN_WITH_TABLE_ALIAS: "should join with table alias",
	SHOULD_HANDLE_MULTIPLE_JOINS: "should handle multiple joins",
	SHOULD_JOIN_WITH_FIND_ONE: "should join with findOne",
	SHOULD_JOIN_WITH_COUNT: "should join with count",
	SHOULD_RETURN_NULL_FOR_NO_MATCH_INNER_JOIN:
		"should return null for no match inner join",
	SHOULD_RETURN_RECORD_WITH_NULL_FIELDS_LEFT_JOIN:
		"should return record with null fields left join",
} as const;

/**
 * Tests for JOIN functionality in adapters
 * This is an optional test suite for adapters that support JOIN operations
 */
export async function runJoinAdapterTest(options: JoinAdapterTestOptions) {
	const {
		getAdapter,
		testPrefix,
		disabledTests,
		tableNames = {},
		fieldMappings = {},
	} = options;

	// Use defaults or provided names
	const userTable = tableNames.user || "user";
	const sessionTable = tableNames.session || "session";
	const emailField = fieldMappings.userEmail || "email";
	const tokenField = fieldMappings.sessionToken || "token";

	const adapter = async () => await getAdapter();

	async function resetDebugLogs() {
		//@ts-expect-error
		(await adapter())?.adapterTestDebugLogs?.resetDebugLogs();
	}

	async function printDebugLogs() {
		//@ts-expect-error
		(await adapter())?.adapterTestDebugLogs?.printDebugLogs();
	}

	// Test data setup
	const testUser = {
		name: "Join Test User",
		email: "jointest@email.com",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const testUser2 = {
		name: "Join Test User 2",
		email: "jointest2@email.com",
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	let userId: string;
	let userId2: string;
	let sessionId: string;
	let sessionId2: string;

	// Setup test data
	beforeAll(async () => {
		try {
			// Create test users
			const user1 = await (await adapter()).create({
				model: "user",
				data: testUser,
			});
			userId = user1.id;

			const user2 = await (await adapter()).create({
				model: "user",
				data: testUser2,
			});
			userId2 = user2.id;

			// Create test sessions
			const session1 = await (await adapter()).create({
				model: "session",
				data: {
					userId: userId,
					token: generateId(),
					expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours
					updatedAt: new Date(),
				},
			});
			sessionId = session1.id;

			const session2 = await (await adapter()).create({
				model: "session",
				data: {
					userId: userId2,
					token: generateId(),
					expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours
					updatedAt: new Date(),
				},
			});
			sessionId2 = session2.id;
		} catch (error) {
			console.warn("Failed to setup JOIN test data:", error);
		}
	});

	test.skipIf(disabledTests?.SHOULD_JOIN_TABLES_WITH_INNER_JOIN)(
		`${testPrefix ? `${testPrefix} - ` : ""}${joinAdapterTests.SHOULD_JOIN_TABLES_WITH_INNER_JOIN}`,
		async ({ onTestFailed }) => {
			await resetDebugLogs();
			onTestFailed(async () => {
				await printDebugLogs();
			});

			const res = await (await adapter()).findMany({
				model: "session",
				where: [{ field: "userId", value: userId }],
				joins: [
					{
						type: "inner",
						table: userTable,
						on: { left: `${sessionTable}.userId`, right: `${userTable}.id` },
						select: ["id", "name", emailField],
					},
				],
			});

			expect(res).toHaveLength(1);
			expect(res[0]).toHaveProperty("userId", userId);
			// Check that user data is included with table prefix
			expect(res[0]).toHaveProperty(`${userTable}_id`, userId);
			expect(res[0]).toHaveProperty(`${userTable}_name`, testUser.name);
			expect(res[0]).toHaveProperty(
				`${userTable}_${emailField}`,
				testUser.email,
			);
		},
	);

	test.skipIf(disabledTests?.SHOULD_JOIN_TABLES_WITH_LEFT_JOIN)(
		`${testPrefix ? `${testPrefix} - ` : ""}${joinAdapterTests.SHOULD_JOIN_TABLES_WITH_LEFT_JOIN}`,
		async ({ onTestFailed }) => {
			await resetDebugLogs();
			onTestFailed(async () => {
				await printDebugLogs();
			});

			// Create a session with a non-existent userId to test LEFT JOIN
			// Note: We create this without foreign key constraints since the user doesn't exist
			const orphanSession = await (await adapter()).create({
				model: "session",
				data: {
					userId: "non-existent-user",
					token: generateId(),
					expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
					updatedAt: new Date(),
				},
			});

			const res = await (await adapter()).findMany({
				model: "session",
				where: [{ field: "id", value: orphanSession.id }],
				joins: [
					{
						type: "left",
						table: userTable,
						on: { left: `${sessionTable}.userId`, right: `${userTable}.id` },
						select: ["id", "name", emailField],
					},
				],
			});

			expect(res).toHaveLength(1);
			expect(res[0]).toHaveProperty("userId", "non-existent-user");
			// With LEFT JOIN, user fields should be null/undefined
			expect([null, undefined]).toContain((res[0] as any)[`${userTable}_id`]);
		},
	);

	test.skipIf(disabledTests?.SHOULD_SELECT_SPECIFIC_FIELDS_FROM_JOINED_TABLE)(
		`${testPrefix ? `${testPrefix} - ` : ""}${joinAdapterTests.SHOULD_SELECT_SPECIFIC_FIELDS_FROM_JOINED_TABLE}`,
		async ({ onTestFailed }) => {
			await resetDebugLogs();
			onTestFailed(async () => {
				await printDebugLogs();
			});

			const res = await (await adapter()).findMany({
				model: "session",
				where: [{ field: "userId", value: userId }],
				joins: [
					{
						type: "inner",
						table: userTable,
						on: { left: `${sessionTable}.userId`, right: `${userTable}.id` },
						select: ["name"], // Only select name field
					},
				],
			});

			expect(res).toHaveLength(1);
			expect(res[0]).toHaveProperty(`${userTable}_name`, testUser.name);
			// Should NOT have other user fields
			expect(res[0]).not.toHaveProperty(`${userTable}_${emailField}`);
			expect(res[0]).not.toHaveProperty(`${userTable}_id`);
		},
	);

	test.skipIf(disabledTests?.SHOULD_JOIN_WITH_FIND_ONE)(
		`${testPrefix ? `${testPrefix} - ` : ""}${joinAdapterTests.SHOULD_JOIN_WITH_FIND_ONE}`,
		async ({ onTestFailed }) => {
			await resetDebugLogs();
			onTestFailed(async () => {
				await printDebugLogs();
			});

			const res = await (await adapter()).findOne({
				model: "session",
				where: [{ field: "id", value: sessionId }],
				joins: [
					{
						type: "inner",
						table: userTable,
						on: { left: `${sessionTable}.userId`, right: `${userTable}.id` },
						select: ["id", "name", emailField],
					},
				],
			});

			expect(res).toBeTruthy();
			expect(res).toHaveProperty("userId", userId);
			expect(res).toHaveProperty(`${userTable}_id`, userId);
			expect(res).toHaveProperty(`${userTable}_name`, testUser.name);
			expect(res).toHaveProperty(`${userTable}_${emailField}`, testUser.email);
		},
	);

	test.skipIf(disabledTests?.SHOULD_JOIN_WITH_COUNT)(
		`${testPrefix ? `${testPrefix} - ` : ""}${joinAdapterTests.SHOULD_JOIN_WITH_COUNT}`,
		async ({ onTestFailed }) => {
			await resetDebugLogs();
			onTestFailed(async () => {
				await printDebugLogs();
			});

			const count = await (await adapter()).count({
				model: "session",
				where: [{ field: "userId", value: userId }],
				joins: [
					{
						type: "inner",
						table: userTable,
						on: { left: `${sessionTable}.userId`, right: `${userTable}.id` },
					},
				],
			});

			expect(count).toBe(1);
		},
	);

	test.skipIf(disabledTests?.SHOULD_HANDLE_MULTIPLE_JOINS)(
		`${testPrefix ? `${testPrefix} - ` : ""}${joinAdapterTests.SHOULD_HANDLE_MULTIPLE_JOINS}`,
		async ({ onTestFailed }) => {
			await resetDebugLogs();
			onTestFailed(async () => {
				await printDebugLogs();
			});

			// This test would require additional tables to be meaningful
			// For now, we'll test multiple joins to the same table with different aliases
			const res = await (await adapter()).findMany({
				model: "session",
				where: [{ field: "userId", value: userId }],
				joins: [
					{
						type: "inner",
						table: userTable,
						on: { left: `${sessionTable}.userId`, right: `user_info.id` },
						select: ["name"],
						alias: "user_info",
					},
					{
						type: "left",
						table: userTable,
						on: { left: `${sessionTable}.userId`, right: `user_contact.id` },
						select: [emailField],
						alias: "user_contact",
					},
				],
			});

			expect(res).toHaveLength(1);
			// With aliases, fields should be prefixed with alias names
			expect(res[0]).toHaveProperty("user_info_name", testUser.name);
			expect(res[0]).toHaveProperty(
				`user_contact_${emailField}`,
				testUser.email,
			);
		},
	);

	test.skipIf(disabledTests?.SHOULD_RETURN_NULL_FOR_NO_MATCH_INNER_JOIN)(
		`${testPrefix ? `${testPrefix} - ` : ""}${joinAdapterTests.SHOULD_RETURN_NULL_FOR_NO_MATCH_INNER_JOIN}`,
		async ({ onTestFailed }) => {
			await resetDebugLogs();
			onTestFailed(async () => {
				await printDebugLogs();
			});

			const res = await (await adapter()).findOne({
				model: "session",
				where: [{ field: "userId", value: "non-existent-user-id" }],
				joins: [
					{
						type: "inner",
						table: userTable,
						on: { left: `${sessionTable}.userId`, right: `${userTable}.id` },
					},
				],
			});

			// INNER JOIN should return null when no matching records
			expect(res).toBeNull();
		},
	);

	// Test without any joins to ensure backward compatibility
	test.skipIf(disabledTests?.SHOULD_WORK_WITHOUT_JOINS)(
		`${testPrefix ? `${testPrefix} - ` : ""}should work without joins (backward compatibility)`,
		async ({ onTestFailed }) => {
			await resetDebugLogs();
			onTestFailed(async () => {
				await printDebugLogs();
			});

			const res = await (await adapter()).findMany({
				model: "session",
				where: [{ field: "userId", value: userId }],
				// No joins parameter
			});

			expect(res).toHaveLength(1);
			expect(res[0]).toHaveProperty("userId", userId);
			// Should NOT have any user_ prefixed fields
			expect(
				Object.keys(res[0] as Record<string, any>).filter((key) =>
					key.startsWith("user_"),
				),
			).toHaveLength(0);
		},
	);
}

export { joinAdapterTests };
