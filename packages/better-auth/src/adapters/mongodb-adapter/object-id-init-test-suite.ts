import { Db, ObjectId } from "mongodb";
import { createTestSuite } from "../create-test-suite";
import { expect } from "vitest";

export const objectIdInitTestSuite = createTestSuite(
	"init",
	{},
	(helpers, x?: { db: Db }) => {
		return {
			"init mongoDB tests": async () => {
				if (!x?.db) throw expect(true).toBe(false);
				const { db } = x;

				const user = await helpers.generate("user");
				expect(user.id).toBeInstanceOf(ObjectId);

				const res = await helpers.adapter.create({
					model: "user",
					data: user,
					forceAllowId: true,
				});
				expect(res.id).toBeTypeOf("string");
				expect(res.id).toBe(
					(user.id as unknown as InstanceType<typeof ObjectId>).toHexString(),
				);

				// Verify the data is correctly saved in MongoDB
				const dbUser = await db.collection("user").findOne({
					_id: user.id as unknown as InstanceType<typeof ObjectId>,
				});
				expect(dbUser).toBeDefined();
				expect(dbUser?._id).toBeInstanceOf(ObjectId);

				const { id: _, ...rest } = user;
				const resWithoutForcedId = await helpers.adapter.create({
					model: "user",
					data: rest,
				});
				expect(resWithoutForcedId.id).toBeTypeOf("string");
				expect(resWithoutForcedId.id).not.toBeUndefined();

				// Verify the auto-generated user is correctly saved in MongoDB with ObjectId
				const dbUserAuto = await db.collection("user").findOne({
					_id: new ObjectId(resWithoutForcedId.id),
				});
				expect(dbUserAuto).toBeDefined();
				expect(dbUserAuto?._id).toBeInstanceOf(ObjectId);
			},
		};
	},
);
