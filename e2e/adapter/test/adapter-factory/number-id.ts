import { createTestSuite } from "@better-auth/test-utils/adapter";
import type { Account, Session, User } from "better-auth/types";
import { expect } from "vitest";
import { getNormalTestSuiteTests } from "./basic";

export const numberIdTestSuite = createTestSuite(
	"number-id",
	{
		defaultBetterAuthOptions: {
			advanced: {
				database: {
					generateId: "serial",
				},
			},
		},
		alwaysMigrate: true,
		prefixTests: "number-id",
	},
	(helpers) => {
		const { "create - should use generateId if provided": _, ...normalTests } =
			getNormalTestSuiteTests({ ...helpers });

		return {
			"init - tests": async () => {
				const opts = helpers.getBetterAuthOptions();
				expect(
					opts.advanced?.database?.useNumberId ||
						opts.advanced?.database?.generateId === "serial",
				).toBe(true);
			},
			"create - should return a number id": async () => {
				const user = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: user,
					forceAllowId: true,
				});
				expect(res).toHaveProperty("id");
				expect(typeof res.id).toBe("string");
				expect(Number(res.id)).toBeGreaterThan(0);
			},
			...normalTests,
		};
	},
);

/**
 * Test suite for per-model useNumberId.
 *
 * Only the "user" model uses numeric IDs; other models (session, account)
 * use string UUIDs.
 */
export const perModelNumberIdTestSuite = createTestSuite(
	"per-model-number-id",
	{
		defaultBetterAuthOptions: {
			advanced: {
				database: {
					generateId: ({ model }) =>
						model === "user" ? false : crypto.randomUUID(),
					useNumberId: ["user"],
				},
			},
		},
		alwaysMigrate: true,
		prefixTests: "per-model-number-id",
	},
	(helpers) => {
		return {
			"init - per-model config is set": async () => {
				const opts = helpers.getBetterAuthOptions();
				const useNumberId = opts.advanced?.database?.useNumberId;
				expect(Array.isArray(useNumberId)).toBe(true);
				expect((useNumberId as string[]).includes("user")).toBe(true);
			},
			"create - user should have a numeric string id": async () => {
				const user = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: user,
					forceAllowId: true,
				});
				expect(res).toHaveProperty("id");
				expect(typeof res.id).toBe("string");
				expect(Number(res.id)).toBeGreaterThan(0);
			},
			"create - session should have a UUID string id": async () => {
				// First create a user
				const user = await helpers.generate("user");
				const createdUser = await helpers.adapter.create<User>({
					model: "user",
					data: user,
					forceAllowId: true,
				});

				const session = await helpers.generate("session");
				session.userId = createdUser.id;
				const res = await helpers.adapter.create<Session>({
					model: "session",
					data: session,
				});
				expect(res).toHaveProperty("id");
				expect(typeof res.id).toBe("string");
				// Session ID should NOT be numeric
				expect(Number.isNaN(Number(res.id))).toBe(true);
			},
			"create - account with integer userId FK works": async () => {
				const user = await helpers.generate("user");
				const createdUser = await helpers.adapter.create<User>({
					model: "user",
					data: user,
					forceAllowId: true,
				});

				const account = await helpers.generate("account");
				account.userId = createdUser.id;
				const res = await helpers.adapter.create<Account>({
					model: "account",
					data: account,
				});
				expect(res).toHaveProperty("id");
				expect(typeof res.id).toBe("string");
				// Account ID should NOT be numeric (UUID)
				expect(Number.isNaN(Number(res.id))).toBe(true);
				// But userId should reference the numeric user id
				expect(res.userId).toBe(createdUser.id);
			},
			"findOne - session by userId FK works across mixed types": async () => {
				const user = await helpers.generate("user");
				const createdUser = await helpers.adapter.create<User>({
					model: "user",
					data: user,
					forceAllowId: true,
				});

				const session = await helpers.generate("session");
				session.userId = createdUser.id;
				await helpers.adapter.create<Session>({
					model: "session",
					data: session,
				});

				const found = await helpers.adapter.findOne<Session>({
					model: "session",
					where: [
						{
							field: "userId",
							value: createdUser.id,
						},
					],
				});
				expect(found).not.toBeNull();
				expect(found!.userId).toBe(createdUser.id);
			},
		};
	},
);
