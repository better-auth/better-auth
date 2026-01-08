import { getMigrations } from "better-auth/db";
import type { SchemaGenerator } from "./types";

export const generateKyselySchema: SchemaGenerator = async ({
	options,
	file,
}) => {
	const { compileMigrations } = await getMigrations(options);
	const migrations = await compileMigrations();
	return {
		code: migrations.trim() === ";" ? "" : migrations,
		fileName:
			file ||
			`./better-auth_migrations/${new Date()
				.toISOString()
				.replace(/:/g, "-")}.sql`,
	};
};
