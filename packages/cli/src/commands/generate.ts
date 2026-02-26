import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import {
	createTelemetry,
	getTelemetryAuthConfig,
} from "@better-auth/telemetry";
import { getAdapter } from "better-auth/db/adapter";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import * as z from "zod/v4";
import { generateSchema } from "../generators";
import { getConfig } from "../utils/get-config";

/**
 * Infer the database type from the config when the adapter can't be
 * initialized (e.g., native driver unavailable in Deno).
 */
function inferDatabaseType(
	database: NonNullable<
		Exclude<NonNullable<Parameters<typeof getAdapter>[0]>["database"], Function>
	>,
): "sqlite" | "pg" | "mysql" | "mssql" | null {
	if ("type" in database && typeof database.type === "string") {
		const t = database.type;
		if (t === "sqlite") return "sqlite";
		if (t === "postgres") return "pg";
		if (t === "mysql") return "mysql";
		if (t === "mssql") return "mssql";
	}
	// Duck-type common database drivers
	if ("aggregate" in database || "open" in database) return "sqlite";
	if ("getConnection" in database) return "mysql";
	if ("connect" in database) return "pg";
	return null;
}

/**
 * Create a stub adapter that provides just enough metadata for the
 * schema generators (id, options.provider) without requiring a live
 * database connection.
 */
function createFallbackAdapter(
	databaseType: "sqlite" | "pg" | "mysql" | "mssql",
): DBAdapter {
	const fail = () => {
		throw new Error(
			"This is a fallback adapter for schema generation only. Database operations are not supported.",
		);
	};
	return {
		id: "kysely",
		create: fail,
		findOne: fail,
		findMany: fail,
		count: fail,
		update: fail,
		updateMany: fail,
		delete: fail,
		deleteMany: fail,
		transaction: fail,
		options: {
			provider: databaseType,
			adapterConfig: {
				adapterId: "kysely",
			},
		},
	};
}

async function generateAction(opts: any) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
			output: z.string().optional(),
			y: z.boolean().optional(),
			yes: z.boolean().optional(),
		})
		.parse(opts);

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		console.error(`The directory "${cwd}" does not exist.`);
		process.exit(1);
	}
	const config = await getConfig({
		cwd,
		configPath: options.config,
	});
	if (!config) {
		console.error(
			"No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.",
		);
		return;
	}

	let adapterInitFailed = false;
	const adapter = await getAdapter(config).catch((e) => {
		// When the database driver can't be loaded (e.g. native modules in Deno),
		// try to create a fallback adapter from config metadata so that
		// generators that don't need a live DB connection (Drizzle, Prisma) still work.
		if (config.database && typeof config.database !== "function") {
			const dbType = inferDatabaseType(config.database);
			if (dbType) {
				adapterInitFailed = true;
				return createFallbackAdapter(dbType);
			}
		}
		console.error(e.message);
		process.exit(1);
	});

	const spinner = yoctoSpinner({ text: "preparing schema..." }).start();

	const schema = await generateSchema({
		adapter,
		file: options.output,
		options: config,
	}).catch((e) => {
		spinner.stop();
		if (adapterInitFailed) {
			console.error(
				`Failed to generate schema: the database driver could not be initialized.\n` +
					`If you're using Deno or an environment where native modules aren't available, ` +
					`consider using a Drizzle or Prisma adapter instead of a direct database connection.\n` +
					`Alternatively, use Node.js to run the CLI: npx @better-auth/cli generate`,
			);
		} else {
			console.error(e.message);
		}
		process.exit(1);
	});

	spinner.stop();
	if (!schema.code) {
		console.log("Your schema is already up to date.");
		// telemetry: track generate attempted, no changes
		try {
			const telemetry = await createTelemetry(config);
			await telemetry.publish({
				type: "cli_generate",
				payload: {
					outcome: "no_changes",
					config: await getTelemetryAuthConfig(config, {
						adapter: adapter.id,
						database:
							typeof config.database === "function" ? "adapter" : "kysely",
					}),
				},
			});
		} catch {}
		process.exit(0);
	}
	if (schema.overwrite) {
		let confirm = options.y || options.yes;
		if (!confirm) {
			const response = await prompts({
				type: "confirm",
				name: "confirm",
				message: `The file ${
					schema.fileName
				} already exists. Do you want to ${chalk.yellow(
					`${schema.overwrite ? "overwrite" : "append"}`,
				)} the schema to the file?`,
			});
			confirm = response.confirm;
		}

		if (confirm) {
			const exist = existsSync(path.join(cwd, schema.fileName));
			if (!exist) {
				await fs.mkdir(path.dirname(path.join(cwd, schema.fileName)), {
					recursive: true,
				});
			}
			if (schema.overwrite) {
				await fs.writeFile(path.join(cwd, schema.fileName), schema.code);
			} else {
				await fs.appendFile(path.join(cwd, schema.fileName), schema.code);
			}
			console.log(
				`🚀 Schema was ${
					schema.overwrite ? "overwritten" : "appended"
				} successfully!`,
			);
			// telemetry: track generate success overwrite/append
			try {
				const telemetry = await createTelemetry(config);
				await telemetry.publish({
					type: "cli_generate",
					payload: {
						outcome: schema.overwrite ? "overwritten" : "appended",
						config: await getTelemetryAuthConfig(config),
					},
				});
			} catch {}
			process.exit(0);
		} else {
			console.error("Schema generation aborted.");
			// telemetry: track generate aborted
			try {
				const telemetry = await createTelemetry(config);
				await telemetry.publish({
					type: "cli_generate",
					payload: {
						outcome: "aborted",
						config: await getTelemetryAuthConfig(config),
					},
				});
			} catch {}
			process.exit(1);
		}
	}

	if (options.y) {
		console.warn("WARNING: --y is deprecated. Consider -y or --yes");
		options.yes = true;
	}

	let confirm = options.yes;

	if (!confirm) {
		const response = await prompts({
			type: "confirm",
			name: "confirm",
			message: `Do you want to generate the schema to ${chalk.yellow(
				schema.fileName,
			)}?`,
		});
		confirm = response.confirm;
	}

	if (!confirm) {
		console.error("Schema generation aborted.");
		// telemetry: track generate aborted before write
		try {
			const telemetry = await createTelemetry(config);
			await telemetry.publish({
				type: "cli_generate",
				payload: {
					outcome: "aborted",
					config: await getTelemetryAuthConfig(config),
				},
			});
		} catch {}
		process.exit(1);
	}

	if (!options.output) {
		const dirExist = existsSync(path.dirname(path.join(cwd, schema.fileName)));
		if (!dirExist) {
			await fs.mkdir(path.dirname(path.join(cwd, schema.fileName)), {
				recursive: true,
			});
		}
	}
	await fs.writeFile(
		options.output || path.join(cwd, schema.fileName),
		schema.code,
	);
	console.log(`🚀 Schema was generated successfully!`);
	// telemetry: track generate success
	try {
		const telemetry = await createTelemetry(config);
		await telemetry.publish({
			type: "cli_generate",
			payload: {
				outcome: "generated",
				config: await getTelemetryAuthConfig(config),
			},
		});
	} catch {}
	process.exit(0);
}

export const generate = new Command("generate")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"--config <config>",
		"the path to the configuration file. defaults to the first configuration file found.",
	)
	.option("--output <output>", "the file to output to the generated schema")
	.option("-y, --yes", "automatically answer yes to all prompts", false)
	.option("--y", "(deprecated) same as --yes", false)
	.action(generateAction);
