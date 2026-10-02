import { getMigrations } from "better-auth/db/migration";
import type { SchemaGenerator } from "./types";

function commentBanner(unsafeChanges: string[]): string {
	const rule = `-- ${"-".repeat(77)}`;
	const lines = [
		rule,
		"-- DO NOT RUN THIS SCRIPT AS IT IS.",
		"-- Applying it to a populated database corrupts the rows it touches:",
	];
	for (const change of unsafeChanges) {
		lines.push("--", `-- ${change}`);
	}
	lines.push(rule, "");
	return lines.join("\n");
}

export const generateKyselySchema: SchemaGenerator = async ({
	options,
	file,
}) => {
	const { compileMigrations, unsafeChanges, schemaProblems } =
		await getMigrations(options, {
			throwOnUnsafe: false,
		});
	const migrations = await compileMigrations();
	const code = migrations.trim() === ";" ? "" : migrations;
	return {
		code: unsafeChanges.length
			? `${commentBanner(unsafeChanges)}${code}`
			: code,
		unsafeChanges,
		schemaProblems,
		fileName:
			file ||
			`./better-auth_migrations/${new Date()
				.toISOString()
				.replace(/:/g, "-")}.sql`,
	};
};
