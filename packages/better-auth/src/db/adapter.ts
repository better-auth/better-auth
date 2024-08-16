import { Kysely } from "kysely";
export const adapter = (db: Kysely<any>) => {
	return {
		createUser: async () => {
			await db
				.insertInto("user")
				.values({
					id: 1,
				})
				.execute();
		},
	};
};
