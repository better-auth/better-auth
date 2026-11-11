import type { BetterAuthPlugin } from "@better-auth/core";
import type { Session, User } from "better-auth/types";
import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";
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
				expect(opts.advanced?.database?.generateId === "serial").toBe(true);
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
			/**
			 * @see https://github.com/better-auth/better-auth/issues/10773
			 */
			"findMany - should match nothing for an id that is not numeric":
				async () => {
					const [user] = await helpers.insertRandom("user");
					const adapter = helpers.adapter;
					expect(
						await adapter.findOne<User>({
							model: "user",
							where: [{ field: "id", value: "agent-host-xyz" }],
						}),
					).toBeNull();
					expect(
						await adapter.findMany<Session>({
							model: "session",
							where: [{ field: "userId", value: "agent-host-xyz" }],
						}),
					).toEqual([]);
					expect(
						await adapter.count({
							model: "user",
							where: [{ field: "id", value: " " }],
						}),
					).toBe(0);
					expect(
						await adapter.updateMany({
							model: "user",
							where: [{ field: "id", value: "agent-host-xyz" }],
							update: { name: "changed" },
						}),
					).toBe(0);
					const found = await adapter.findMany<User>({
						model: "user",
						where: [
							{
								field: "id",
								operator: "in",
								value: [user!.id, "agent-host-xyz"],
							},
						],
					});
					expect(found.map((row) => row.id)).toEqual([user!.id]);
				},
			"updateMany - should match a missing reference with null": {
				migrateBetterAuth: {
					plugins: [
						{
							id: "nullable-reference-test",
							schema: {
								testModel: {
									fields: {
										nullableReference: {
											type: "string",
											references: { field: "id", model: "user" },
											required: false,
										},
									},
								},
							},
						} satisfies BetterAuthPlugin,
					],
				},
				test: async () => {
					const [user] = await helpers.insertRandom("user");
					const adapter = helpers.adapter;
					await adapter.create({
						model: "testModel",
						data: { nullableReference: null },
						forceAllowId: true,
					});
					await adapter.create({
						model: "testModel",
						data: { nullableReference: user!.id },
						forceAllowId: true,
					});
					expect(
						await adapter.updateMany({
							model: "testModel",
							where: [{ field: "nullableReference", value: null }],
							update: { nullableReference: user!.id },
						}),
					).toBe(1);
				},
			},
			...normalTests,
		};
	},
);
