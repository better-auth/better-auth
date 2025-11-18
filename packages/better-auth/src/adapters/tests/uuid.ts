import { expect } from "vitest";
import type { User } from "../../../../core/src/db/schema/user";
import { createTestSuite } from "../create-test-suite";
import { getNormalTestSuiteTests } from "./basic";

export const uuidTestSuite = createTestSuite(
	"uuid",
	{
		defaultBetterAuthOptions: {
			advanced: {
				database: {
					generateId: "uuid",
				},
			},
		},
		prefixTests: "uuid",
		alwaysMigrate: true,
		// This is here to overwrite `generateId` functions to generate UUIDs instead of the default.
		// Since existing tests often use generated IDs as well as `forceAllowId` to be true, this is needed to ensure the tests pass.
		customIdGenerator() {
			return crypto.randomUUID();
		},
	},
	(helpers) => {
		const { "create - should use generateId if provided": _, ...normalTests } =
			getNormalTestSuiteTests(helpers);
		return {
			"init - tests": async () => {
				const opts = helpers.getBetterAuthOptions();
				expect(opts.advanced?.database?.generateId === "uuid").toBe(true);
			},
			"create - should return a uuid": async () => {
				const user = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: {
						...user,
						//@ts-expect-error - remove id from `user`
						id: undefined,
					},
				});
				expect(res).toHaveProperty("id");
				expect(typeof res.id).toBe("string");
				const uuidRegex =
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
				expect(res.id).toMatch(uuidRegex);
				console.log(res);
			},
			"findOne - should find a model using a uuid": async () => {
				const { id: _, ...user } = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: user,
				});

				const result = await helpers.adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: res.id }],
				});
				const uuidRegex =
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
				expect(result?.id).toMatch(uuidRegex);
				expect(result).toEqual(res);
			},
			...normalTests,
		};
	},
);
