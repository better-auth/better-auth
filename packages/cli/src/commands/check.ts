import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import * as z from "zod";
import { getAuth } from "../utils/get-config";

const sourceLabels = {
	database: "the live database",
	drizzle: "the configured Drizzle schema",
	prisma: "the generated Prisma client model",
} as const;

async function checkSchemaAction(input: unknown): Promise<void> {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
		})
		.parse(input);
	const cwd = path.resolve(options.cwd);
	let cwdStat: Stats;
	try {
		cwdStat = await stat(cwd);
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException;
		if (code === "ENOENT") {
			console.error(`The directory "${cwd}" does not exist.`);
		} else {
			console.error(
				`Could not access the directory "${cwd}"${code ? ` (${code}).` : "."}`,
			);
		}
		process.exitCode = 2;
		return;
	}
	if (!cwdStat.isDirectory()) {
		console.error(`The path "${cwd}" is not a directory.`);
		process.exitCode = 2;
		return;
	}

	let auth: Awaited<ReturnType<typeof getAuth>>;
	try {
		auth = await getAuth({
			cwd,
			configPath: options.config,
			shouldThrowOnError: true,
		});
	} catch {
		console.error("Could not load the Better Auth configuration.");
		process.exitCode = 2;
		return;
	}
	if (!auth) {
		console.error(
			"No Better Auth configuration found. Pass --config to select one.",
		);
		process.exitCode = 2;
		return;
	}

	try {
		const context = await auth.$context;
		const check = context.explicitSchemaCheck;
		if (!check) {
			console.error(
				`Schema validation is not available for adapter "${context.adapter.id}".`,
			);
			process.exitCode = 2;
			return;
		}
		await check();
		const source = check.source
			? sourceLabels[check.source]
			: `adapter "${context.adapter.id}"`;
		console.log(`Schema check passed against ${source}.`);
		process.exitCode = 0;
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			error.code === "SCHEMA_MISMATCH"
		) {
			console.error(error.message);
			process.exitCode = 1;
			return;
		}
		console.error(
			"Could not validate the schema. Check the auth configuration and database connection.",
		);
		process.exitCode = 2;
	}
}

async function runSchemaCheck(options: unknown): Promise<void> {
	await checkSchemaAction(options);
	process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
}

export const check = new Command("check")
	.description("Run all available Better Auth checks")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"--config <config>",
		"the path to the Better Auth configuration file.",
	)
	.action(runSchemaCheck);

check
	.command("schema")
	.description(
		"Check that the configured schema can hold what Better Auth writes",
	)
	.configureHelp({ showGlobalOptions: true })
	.action((_options, command) => runSchemaCheck(command.optsWithGlobals()));
