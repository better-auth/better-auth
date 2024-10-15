import { getMigrations } from "better-auth/db";
import type { SchemaGenerator } from "./types";

export const generateMigrations: SchemaGenerator = async ({ options }) => {
	const { compileMigrations } = await getMigrations(options);
	const migrations = await compileMigrations();
	return {
		code: migrations,
		fileName: `./better-auth_migrations/${new Date()
			.toISOString()
			.replace(/:/g, "-")}.sql`,
	};
};
