import {
	type DatabaseAdapter,
	databasesConfig,
} from "../configs/databases.config";

export const getDatabaseCode = (adapter: DatabaseAdapter) => {
	const database = databasesConfig.find(
		(database) => database.adapter === adapter,
	)!;

	return database;
};
