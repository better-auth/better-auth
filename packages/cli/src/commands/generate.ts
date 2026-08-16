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
import * as z from "zod";
import { generateSchema } from "../generators";
import { getConfig } from "../utils/get-config";

function createMockAdapter(adapterId: string, dialect?: string): DBAdapter {
	// Map dialect to provider format for each adapter
	let provider: string | undefined;
	if (dialect) {
		if (adapterId === "drizzle") {
			// Drizzle uses: pg, mysql, sqlite
			if (dialect === "postgresql") {
				provider = "pg";
			} else if (dialect === "mysql" || dialect === "sqlite") {
				provider = dialect;
			} else {
				// For other dialects, try to use as-is or default to pg
				provider = dialect;
			}
		} else if (adapterId === "prisma") {
			// Prisma uses: postgresql, mysql, sqlite, mongodb, etc.
			provider = dialect;
		}
	}

	return {
		id: adapterId,
		create: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		findOne: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		findMany: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		count: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		update: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		updateMany: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		delete: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		deleteMany: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		consumeOne: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		incrementOne: async () => {
			throw new Error("Mock adapter methods should not be called");
		},
		transaction: async (callback) => {
			throw new Error("Mock adapter methods should not be called");
		},
		options: {
			adapterConfig: {
				adapterId,
			},
			...(provider && { provider }),
		},
	};
}

async function generateAction(opts: any) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
			output: z.string().optional(),
			adapter: z.string().optional(),
			dialect: z.string().optional(),
			y: z.boolean().optional(),
			yes: z.boolean().optional(),
		})
		.parse(opts);

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		console.error(`The directory "${cwd}" does not exist.`);
		process.exit(1);
	}

	// If --output points to an existing directory, treat it as the output
	// directory and append the default filename instead of writing to the
	// directory path itself (which causes EISDIR).
	if (options.output) {
		const resolvedOutput = path.resolve(cwd, options.output);
		try {
			const stat = await fs.stat(resolvedOutput);
			if (stat.isDirectory()) {
				options.output = path.join(options.output, "auth-schema.ts");
			}
		} catch {
			// path doesn't exist yet — treat as a file path, which is fine
		}
	}

	// Always resolve --output against the CLI `--cwd`, never process.cwd().
	// getConfig stubs against this same path; the final write and abort
	// cleanup must target it too.
	const resolvedOutputPath = options.output
		? path.resolve(cwd, options.output)
		: undefined;
	const outputExistedBefore = resolvedOutputPath
		? existsSync(resolvedOutputPath)
		: true;
	const removeGeneratedStub = async () => {
		if (!resolvedOutputPath || outputExistedBefore) return;
		await fs.rm(resolvedOutputPath, { force: true }).catch(() => {});
	};

	const config = await getConfig({
		cwd,
		configPath: options.config,
		// Recovers from first-run templates (e.g. the Convex integration guide)
		// whose config imports the schema file this command is about to
		// generate. @see https://github.com/better-auth/better-auth/issues/10136
		outputPath: options.output,
	});
	if (!config) {
		await removeGeneratedStub();
		console.error(
			"No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.",
		);
		return;
	}

	let adapter: DBAdapter;
	if (options.adapter) {
		// Use mock adapter when --adapter flag is provided
		adapter = createMockAdapter(options.adapter, options.dialect);
	} else {
		// Get adapter from config (existing behavior)
		adapter = await getAdapter(config).catch(async (e) => {
			console.error(e.message);
			await removeGeneratedStub();
			process.exit(1);
		});
	}

	const spinner = yoctoSpinner({ text: "preparing schema..." }).start();

	const schema = await generateSchema({
		adapter,
		file: resolvedOutputPath ?? options.output,
		options: config,
	});

	spinner.stop();
	if (!schema.code) {
		await removeGeneratedStub();
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
			const schemaPath = path.isAbsolute(schema.fileName)
				? schema.fileName
				: path.join(cwd, schema.fileName);
			const exist = existsSync(schemaPath);
			if (!exist) {
				await fs.mkdir(path.dirname(schemaPath), {
					recursive: true,
				});
			}
			if (schema.overwrite) {
				await fs.writeFile(schemaPath, schema.code);
			} else {
				await fs.appendFile(schemaPath, schema.code);
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
			await removeGeneratedStub();
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
		await removeGeneratedStub();
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

	const writePath = resolvedOutputPath ?? path.join(cwd, schema.fileName);
	const dirExist = existsSync(path.dirname(writePath));
	if (!dirExist) {
		await fs.mkdir(path.dirname(writePath), {
			recursive: true,
		});
	}
	await fs.writeFile(writePath, schema.code);
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
	.option(
		"--adapter <adapter>",
		"specify the adapter type (e.g., prisma, drizzle, kysely) without requiring a configured adapter",
	)
	.option(
		"--dialect <dialect>",
		"specify the database dialect/provider (e.g., postgresql, mysql, sqlite). For drizzle, postgresql maps to 'pg'",
	)
	.option("-y, --yes", "automatically answer yes to all prompts", false)
	.option("--y", "(deprecated) same as --yes", false)
	.action(generateAction);
