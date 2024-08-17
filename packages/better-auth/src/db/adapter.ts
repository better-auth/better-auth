import { Kysely } from "kysely";
import { User } from "../schema";

export const getAdapter = (db: Kysely<any>) => {
	return {
		createUser: async (user: User) => {
			return await db.insertInto("user").values(user).executeTakeFirst();
		},
	};
};

export type InternalAdapter = ReturnType<typeof getAdapter>;
