import type {
	DatabaseAdapter,
	DatabasesConfig,
} from "../configs/databases.config";
import { databasesConfig } from "../configs/databases.config";

export const getDatabaseCode = <A extends DatabaseAdapter | null>(
	adapter: A,
): A extends DatabaseAdapter ? DatabasesConfig : null => {
	if (!adapter) return null as any;
	const database = databasesConfig.find(
		(database) => database.adapter === adapter,
	)!;

	return database as any;
};
