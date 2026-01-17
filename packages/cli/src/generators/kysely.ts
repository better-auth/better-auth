import { getMigrations } from "better-auth/db";
import type { SchemaGenerator, SchemaGeneratorOptions } from "./types";

export const generateKyselySchema: SchemaGenerator = async ({
	options,
	file,
	force,
}) => {
	const { compileMigrations } = await getMigrations(options, { force });
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

/**
 * Generate migrations for Kysely adapter
 * Exported for testing purposes
 */
export const generateMigrations = async (
	opts: Omit<SchemaGeneratorOptions, "adapter">,
) => {
	const { compileMigrations } = await getMigrations(opts.options, {
		force: opts.force,
	});
	const migrations = await compileMigrations();
	return {
		code: migrations.trim() === ";" ? "" : migrations,
		fileName:
			opts.file ||
			`./better-auth_migrations/${new Date()
				.toISOString()
				.replace(/:/g, "-")}.sql`,
	};
};
