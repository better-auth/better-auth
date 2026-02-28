import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import * as semver from "semver";
import yoctoSpinner from "yocto-spinner";
import * as z from "zod/v4";
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

export async function upgradeAction(opts: unknown) {
	const options = z
		.object({
			cwd: z.string(),
			yes: z.boolean().optional(),
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
	.action(upgradeAction);
