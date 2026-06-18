import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import * as semver from "semver";
import yoctoSpinner from "yocto-spinner";
import * as z from "zod";
import { detectPackageManager } from "../utils/check-package-managers";
import { fetchLatestVersion } from "../utils/fetch-latest-version";
import { getPackageInfo } from "../utils/get-package-info";
import { installDependencies } from "../utils/install-dependencies";

function isBetterAuthPackage(name: string): boolean {
	return name === "better-auth" || name.startsWith("@better-auth/");
}

interface UpgradeEntry {
	name: string;
	current: string;
	latest: string;
	depType: "prod" | "dev";
}

interface SchemaField {
	type?: unknown;
	references?: unknown;
}
interface SchemaTable {
	fields: Record<string, SchemaField>;
	order?: number;
}
type SchemaSnapshot = Record<string, SchemaTable>;

interface FieldEntry {
	name: string;
	type: string;
}
interface FieldChange {
	name: string;
	from: string;
	to: string;
}
interface TableDiff {
	table: string;
	addedFields: FieldEntry[];
	removedFields: FieldEntry[];
	changedFields: FieldChange[];
}
interface SchemaDiff {
	createdTables: { table: string; fields: FieldEntry[] }[];
	removedTables: { table: string; fields: FieldEntry[] }[];
	changedTables: TableDiff[];
}

function fieldType(field: SchemaField | undefined): string {
	if (!field || field.type == null) return "unknown";
	return typeof field.type === "string" ? field.type : String(field.type);
}

function tableFields(table: SchemaTable | undefined): FieldEntry[] {
	if (!table?.fields) return [];
	return Object.entries(table.fields).map(([name, field]) => ({
		name,
		type: fieldType(field),
	}));
}

/**
 * Computes a config-level schema diff between two snapshots produced by
 * {@link captureSchemaSnapshot}. Pure: depends only on its inputs.
 */
export function diffSchemas(
	before: SchemaSnapshot,
	after: SchemaSnapshot,
): SchemaDiff {
	const diff: SchemaDiff = {
		createdTables: [],
		removedTables: [],
		changedTables: [],
	};

	for (const [table, def] of Object.entries(after)) {
		if (!before[table]) {
			diff.createdTables.push({ table, fields: tableFields(def) });
		}
	}
	for (const [table, def] of Object.entries(before)) {
		if (!after[table]) {
			diff.removedTables.push({ table, fields: tableFields(def) });
		}
	}

	for (const [table, afterDef] of Object.entries(after)) {
		const beforeDef = before[table];
		if (!beforeDef) continue;
		const beforeFields = beforeDef.fields ?? {};
		const afterFields = afterDef.fields ?? {};
		const addedFields: FieldEntry[] = [];
		const removedFields: FieldEntry[] = [];
		const changedFields: FieldChange[] = [];

		for (const [name, field] of Object.entries(afterFields)) {
			if (!(name in beforeFields)) {
				addedFields.push({ name, type: fieldType(field) });
				continue;
			}
			const from = fieldType(beforeFields[name]);
			const to = fieldType(field);
			if (from !== to) changedFields.push({ name, from, to });
		}
		for (const name of Object.keys(beforeFields)) {
			if (!(name in afterFields)) {
				removedFields.push({ name, type: fieldType(beforeFields[name]) });
			}
		}

		if (addedFields.length || removedFields.length || changedFields.length) {
			diff.changedTables.push({
				table,
				addedFields,
				removedFields,
				changedFields,
			});
		}
	}

	return diff;
}

export function isSchemaDiffEmpty(diff: SchemaDiff): boolean {
	return (
		diff.createdTables.length === 0 &&
		diff.removedTables.length === 0 &&
		diff.changedTables.length === 0
	);
}

const ANSI_REGEX = /\u001b\[[0-9;]*m/g;
function visibleLength(text: string): number {
	return text.replace(ANSI_REGEX, "").length;
}

/**
 * Renders a {@link SchemaDiff} as a boxed, color-coded summary using chalk.
 * Pure: returns the string to print.
 */
export function renderSchemaDiffBox(diff: SchemaDiff): string {
	const lines: string[] = [];
	lines.push(chalk.bold("Schema changes from upgrade"));

	for (const { table, fields } of diff.createdTables) {
		lines.push("");
		lines.push(chalk.green(`+ ${table}`) + chalk.gray(" (new table)"));
		for (const f of fields) {
			lines.push(`  ${chalk.green(`+ ${f.name}`)} ${chalk.gray(f.type)}`);
		}
	}

	for (const t of diff.changedTables) {
		lines.push("");
		lines.push(chalk.yellow(`~ ${t.table}`));
		for (const f of t.addedFields) {
			lines.push(`  ${chalk.green(`+ ${f.name}`)} ${chalk.gray(f.type)}`);
		}
		for (const f of t.changedFields) {
			lines.push(
				`  ${chalk.yellow(`~ ${f.name}`)} ${chalk.gray(
					`${f.from} -> ${f.to}`,
				)}`,
			);
		}
		for (const f of t.removedFields) {
			lines.push(`  ${chalk.red(`- ${f.name}`)} ${chalk.gray(f.type)}`);
		}
	}

	for (const { table, fields } of diff.removedTables) {
		lines.push("");
		lines.push(chalk.red(`- ${table}`) + chalk.gray(" (removed)"));
		for (const f of fields) {
			lines.push(`  ${chalk.red(`- ${f.name}`)} ${chalk.gray(f.type)}`);
		}
	}

	const width = lines.reduce((max, l) => Math.max(max, visibleLength(l)), 0);
	const top = `┌${"─".repeat(width + 2)}┐`;
	const bottom = `└${"─".repeat(width + 2)}┘`;
	const body = lines.map((l) => {
		const pad = " ".repeat(width - visibleLength(l));
		return `│ ${l}${pad} │`;
	});
	return [top, ...body, bottom].join("\n");
}

/**
 * Captures the config-derived schema in a fresh process so it reflects the
 * currently installed better-auth version (module caches in the current
 * process would otherwise hide post-install changes). Returns `null` when the
 * snapshot can't be produced, so the upgrade flow can degrade gracefully.
 */
function captureSchemaSnapshot({
	cwd,
	config,
}: {
	cwd: string;
	config?: string;
}): Promise<SchemaSnapshot | null> {
	return new Promise((resolve) => {
		const entry = process.argv[1];
		if (!entry) return resolve(null);
		const args = [
			...process.execArgv,
			entry,
			"internal-schema-snapshot",
			"--cwd",
			cwd,
		];
		if (config) args.push("--config", config);

		const child = spawn(process.execPath, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", () => {});
		child.on("error", () => resolve(null));
		child.on("close", (code) => {
			if (code !== 0) return resolve(null);
			try {
				resolve(JSON.parse(stdout) as SchemaSnapshot);
			} catch {
				resolve(null);
			}
		});
	});
}

async function upgradeAction(opts: unknown) {
	const options = z
		.object({
			cwd: z.string(),
			yes: z.boolean().optional(),
			config: z.string().optional(),
			skipSchemaDiff: z.boolean().optional(),
		})
		.parse(opts);

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		console.error(`The directory "${cwd}" does not exist.`);
		process.exit(1);
	}

	let packageJson: Record<string, any>;
	try {
		packageJson = getPackageInfo(cwd);
	} catch {
		console.error(
			`Could not read package.json in "${cwd}". Make sure you are in a project directory.`,
		);
		process.exit(1);
	}

	const deps = packageJson.dependencies ?? {};
	const devDeps = packageJson.devDependencies ?? {};

	const candidates: {
		name: string;
		current: string;
		depType: "prod" | "dev";
	}[] = [];

	for (const [name, version] of Object.entries(deps) as [string, string][]) {
		if (isBetterAuthPackage(name) && !version.startsWith("workspace:")) {
			candidates.push({ name, current: version, depType: "prod" });
		}
	}
	for (const [name, version] of Object.entries(devDeps) as [string, string][]) {
		if (isBetterAuthPackage(name) && !version.startsWith("workspace:")) {
			candidates.push({ name, current: version, depType: "dev" });
		}
	}

	if (candidates.length === 0) {
		console.log("No better-auth packages found in this project.");
		return;
	}

	const spinner = yoctoSpinner({ text: "checking for updates..." }).start();

	const results = await Promise.allSettled(
		candidates.map(async (c) => {
			const latest = await fetchLatestVersion(c.name);
			return { ...c, latest };
		}),
	);

	const upgrades: UpgradeEntry[] = [];
	for (const result of results) {
		if (result.status !== "fulfilled" || !result.value.latest) {
			continue;
		}
		const { name, current, latest, depType } = result.value;
		const coerced = semver.coerce(current);
		if (coerced && semver.lt(coerced, latest)) {
			upgrades.push({ name, current, latest, depType });
		}
	}

	spinner.stop();

	if (upgrades.length === 0) {
		console.log("All better-auth packages are up to date.");
		return;
	}

	console.log(`\nThe following packages can be upgraded:\n`);
	for (const u of upgrades) {
		console.log(
			`  ${chalk.cyan(u.name)}  ${chalk.gray(u.current)} ${chalk.white("→")} ${chalk.green(u.latest)}`,
		);
	}
	console.log();

	let confirmed = options.yes;
	if (!confirmed) {
		const response = await prompts({
			type: "confirm",
			name: "confirmed",
			message: "Do you want to upgrade these packages?",
			initial: true,
		});
		confirmed = response.confirmed;
	}

	if (!confirmed) {
		console.log("Upgrade cancelled.");
		return;
	}

	const { packageManager } = await detectPackageManager(cwd, packageJson);

	const before = options.skipSchemaDiff
		? null
		: await captureSchemaSnapshot({ cwd, config: options.config });

	const prodUpgrades = upgrades
		.filter((u) => u.depType === "prod")
		.map((u) => `${u.name}@${u.latest}`);
	const devUpgrades = upgrades
		.filter((u) => u.depType === "dev")
		.map((u) => `${u.name}@${u.latest}`);

	const installSpinner = yoctoSpinner({
		text: "installing updates...",
	}).start();

	try {
		if (prodUpgrades.length > 0) {
			await installDependencies({
				dependencies: prodUpgrades,
				packageManager,
				cwd,
				type: "prod",
			});
		}
		if (devUpgrades.length > 0) {
			await installDependencies({
				dependencies: devUpgrades,
				packageManager,
				cwd,
				type: "dev",
			});
		}
		installSpinner.stop();
		console.log(chalk.green("Successfully upgraded better-auth packages."));
	} catch (error) {
		installSpinner.stop();
		console.error("Failed to install updates:", error);
		process.exit(1);
	}

	if (options.skipSchemaDiff || !before) {
		return;
	}

	try {
		const schemaSpinner = yoctoSpinner({
			text: "checking for schema changes...",
		}).start();
		const after = await captureSchemaSnapshot({ cwd, config: options.config });
		schemaSpinner.stop();

		if (!after) {
			return;
		}

		const diff = diffSchemas(before, after);
		if (isSchemaDiffEmpty(diff)) {
			console.log("\nNo schema changes from this upgrade.");
			return;
		}

		console.log();
		console.log(renderSchemaDiffBox(diff));
		console.log(
			`\nRun ${chalk.cyan(
				"npx @better-auth/cli migrate",
			)} (Kysely) or ${chalk.cyan(
				"npx @better-auth/cli generate",
			)} (Prisma/Drizzle) to apply these changes.`,
		);
	} catch {
		// Schema diffing is best-effort; never fail a successful upgrade.
	}
}

export const upgrade = new Command("upgrade")
	.description("Upgrade better-auth packages to their latest versions")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"-y, --yes",
		"automatically accept and upgrade without prompting",
		false,
	)
	.option(
		"--config <config>",
		"the path to the configuration file. defaults to the first configuration file found.",
	)
	.option(
		"--skip-schema-diff",
		"skip showing database schema changes introduced by the upgrade",
		false,
	)
	.action(upgradeAction);
