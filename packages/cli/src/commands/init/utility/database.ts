import {
	type DatabaseAdapter,
	databasesConfig,
} from "../configs/databases.config";

export const getDatabaseCode = (adapter: DatabaseAdapter | null) => {
	if (!adapter) return null;
	const database = databasesConfig.find(
		(database) => database.adapter === adapter,
	)!;

	return database;
};
