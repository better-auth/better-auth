import { Kysely } from "kysely";
import { MigrationTable, User } from "../schema";
import { BetterAuthOptions } from "../types";
import { MIGRATION_TABLE_NAME } from "./migrations/constants";

export const getAdapter = (db: Kysely<any>, options: BetterAuthOptions) => {
	return {
		createUser: async (user: User) => {
			return await db.insertInto("user").values(user).executeTakeFirst();
		},
		findAllMigrations: async () => {
			try {
				return (await db
					.selectFrom(MIGRATION_TABLE_NAME)
					.selectAll()
					.execute()) as MigrationTable[];
			} catch (e) {
				return [];
			}
		},
	};
};

export type InternalAdapter = ReturnType<typeof getAdapter>;
