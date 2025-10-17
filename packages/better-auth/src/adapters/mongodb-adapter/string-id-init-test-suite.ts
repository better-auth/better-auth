import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";
import type { Db } from "mongodb";

export const stringIdInitTestSuite = createTestSuite(
	"init",
	{},
	(helpers, x?: { db: Db }) => {
		return {
			"init mongoDB tests": async () => {
				if (!x?.db) throw expect(true).toBe(false);
				const { db } = x;

				const user = await helpers.generate("user");
				expect(user.id).toBeTypeOf("string");

				const res = await helpers.adapter.create({
					model: "user",
					data: user,
					forceAllowId: true,
				});
				expect(res.id).toBeTypeOf("string");
				expect(res.id).toBe(user.id);

				// Verify the data is correctly saved in MongoDB with string ID
				const dbUser = await db.collection("user").findOne({
					//@ts-expect-error
					_id: user.id,
				});
				expect(dbUser).toBeDefined();
				expect(dbUser?._id).toBeTypeOf("string");

				const { id: _, ...rest } = user;
				const resWithoutForcedId = await helpers.adapter.create({
					model: "user",
					data: rest,
				});
				expect(resWithoutForcedId.id).toBeTypeOf("string");
				expect(resWithoutForcedId.id).not.toBeUndefined();

				// Verify the auto-generated user is correctly saved in MongoDB with string ID
				const dbUserAuto = await db.collection("user").findOne({
					_id: resWithoutForcedId.id,
				});
				expect(dbUserAuto).toBeDefined();
				expect(dbUserAuto?._id).toBeTypeOf("string");
			},
		};
	},
);
