import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BetterAuthOptions } from "@better-auth/core";
import { getSchema as bundledGetSchema } from "better-auth/db";
import { Command } from "commander";
import * as z from "zod";
import { getConfig } from "../utils/get-config";

type GetSchema = (config: BetterAuthOptions) => unknown;

/**
 * Resolve `getSchema` from the user's installed `better-auth/db` (relative to
 * `cwd`) so the computed schema reflects the user's installed version
 * (including core table changes), not the version bundled with the CLI.
 * Falls back to the bundled `getSchema` when resolution fails (e.g. older
 * versions that don't export it from `better-auth/db`).
 */
async function resolveGetSchema(cwd: string): Promise<GetSchema> {
	try {
		const require = createRequire(path.join(cwd, "index.js"));
		const resolved = require.resolve("better-auth/db");
		const mod = (await import(pathToFileURL(resolved).href)) as {
			getSchema?: GetSchema;
		};
		if (typeof mod.getSchema === "function") {
			return mod.getSchema;
		}
	} catch {}
	return bundledGetSchema as GetSchema;
}

/** @internal */
export async function internalSchemaSnapshotAction(opts: unknown) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
		})
		.parse(opts);

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		process.stderr.write(`The directory "${cwd}" does not exist.\n`);
		process.exit(1);
	}

	const config = await getConfig({
		cwd,
		configPath: options.config,
		shouldThrowOnError: true,
	}).catch((error: unknown) => {
		process.stderr.write(
			`Failed to load auth config: ${
				error instanceof Error ? error.message : String(error)
			}\n`,
		);
		process.exit(1);
	});

	if (!config) {
		process.stderr.write("No auth configuration found.\n");
		process.exit(1);
	}

	const getSchema = await resolveGetSchema(cwd);
	const schema = getSchema(config);
	process.stdout.write(JSON.stringify(schema));
	process.exit(0);
}

/**
 * Internal helper command used by `upgrade` to capture the config-derived
 * schema in a fresh process. Not intended for direct use; registered hidden.
 */
export const internalSchemaSnapshot = new Command("internal-schema-snapshot")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"--config <config>",
		"the path to the configuration file. defaults to the first configuration file found.",
	)
	.action(internalSchemaSnapshotAction);
