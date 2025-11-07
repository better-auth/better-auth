import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";
import type { User } from "../../../../core/src/db/schema/user";

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
	},
	(helpers) => {
		return {
			"init - tests": async () => {
				const opts = helpers.getBetterAuthOptions();
				expect(opts.advanced?.database?.generateId === "uuid").toBe(true);
			},
			"create - should return a uuid": async () => {
				const user = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: user,
					forceAllowId: true,
				});
				expect(res).toHaveProperty("id");
				expect(typeof res.id).toBe("string");
				const uuidRegex =
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
				expect(res.id).toMatch(uuidRegex);
			},
			"findOne - should find a model using a uuid": async () => {
				const user = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: user,
					forceAllowId: true,
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
		};
	},
);
