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
import { removeDependencies } from "../utils/remove-dependencies";

/**
 * Map of better-auth packages that were renamed on npm. The CLI was
 * published as `@better-auth/cli` until v1.4.21 and then renamed to
 * `auth`; the old name is unmaintained on npm. Leaving it pinned in
 * a project drags an obsolete `better-auth@1.4.21` (and its old
 * `better-call`) into the install tree, which silently breaks the
 * current `@better-auth/core` peer-dep resolution.
 *
 * @see https://github.com/better-auth/better-auth/issues/9558
 */
const RENAMED_PACKAGES: Record<string, string> = {
	"@better-auth/cli": "auth",
};

function isBetterAuthPackage(name: string): boolean {
	return (
		name === "better-auth" ||
		name === "auth" ||
		name.startsWith("@better-auth/")
	);
}

interface UpgradeEntry {
	name: string;
	current: string;
	latest: string;
	depType: "prod" | "dev";
}

interface RenameEntry {
	oldName: string;
	newName: string;
	current: string;
	latest: string;
	depType: "prod" | "dev";
}

async function upgradeAction(opts: unknown) {
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

	const upgradeScans: {
		name: string;
		current: string;
		depType: "prod" | "dev";
	}[] = [];
	const renameScans: {
		oldName: string;
		newName: string;
		current: string;
		depType: "prod" | "dev";
	}[] = [];

	const classify = (name: string, version: string, depType: "prod" | "dev") => {
		if (version.startsWith("workspace:")) return;
		if (Object.hasOwn(RENAMED_PACKAGES, name)) {
			renameScans.push({
				oldName: name,
				newName: RENAMED_PACKAGES[name]!,
				current: version,
				depType,
			});
			return;
		}
		if (isBetterAuthPackage(name)) {
			upgradeScans.push({ name, current: version, depType });
		}
	};

	for (const [name, version] of Object.entries(deps) as [string, string][]) {
		classify(name, version, "prod");
	}
	for (const [name, version] of Object.entries(devDeps) as [string, string][]) {
		classify(name, version, "dev");
	}

	if (upgradeScans.length === 0 && renameScans.length === 0) {
		console.log("No better-auth packages found in this project.");
		return;
	}

	const spinner = yoctoSpinner({ text: "checking for updates..." }).start();

	const [upgradeResults, renameResults] = await Promise.all([
		Promise.allSettled(
			upgradeScans.map(async (c) => {
				const latest = await fetchLatestVersion(c.name);
				return { ...c, latest };
			}),
		),
		Promise.allSettled(
			renameScans.map(async (c) => {
				const latest = await fetchLatestVersion(c.newName);
				return { ...c, latest };
			}),
		),
	]);

	const upgrades: UpgradeEntry[] = [];
	for (const result of upgradeResults) {
		if (result.status !== "fulfilled" || !result.value.latest) {
			continue;
		}
		const { name, current, latest, depType } = result.value;
		const coerced = semver.coerce(current);
		if (coerced && semver.lt(coerced, latest)) {
			upgrades.push({ name, current, latest, depType });
		}
	}

	// Dedupe renames by oldName. If a package somehow appears in both
	// `dependencies` and `devDependencies`, the first scan wins (prod
	// before dev, by classify order). Keeps the remove + install pair
	// from acting on the same name twice.
	const renames: RenameEntry[] = [];
	const unresolvedRenames: string[] = [];
	const seenOldNames = new Set<string>();
	for (const result of renameResults) {
		if (result.status !== "fulfilled") continue;
		const { oldName, newName, current, latest, depType } = result.value;
		if (seenOldNames.has(oldName)) continue;
		seenOldNames.add(oldName);
		if (!latest) {
			unresolvedRenames.push(oldName);
			continue;
		}
		renames.push({ oldName, newName, current, latest, depType });
	}

	spinner.stop();

	if (unresolvedRenames.length > 0) {
		console.warn(
			chalk.yellow(
				`Warning: could not fetch a replacement version for ${unresolvedRenames.join(", ")}. They will be left in place.`,
			),
		);
	}

	if (upgrades.length === 0 && renames.length === 0) {
		if (unresolvedRenames.length === 0) {
			console.log("All better-auth packages are up to date.");
		}
		return;
	}

	if (renames.length > 0) {
		console.log(
			`\nThe following packages were renamed and will be replaced:\n`,
		);
		for (const r of renames) {
			console.log(
				`  ${chalk.cyan(r.oldName)} ${chalk.gray(r.current)} ${chalk.white("→")} ${chalk.cyan(r.newName)} ${chalk.green(r.latest)}`,
			);
		}
		console.log(
			chalk.gray(
				`  keeping the old name causes peer-dep skew (see issue #9558)`,
			),
		);
		console.log();
	}

	if (upgrades.length > 0) {
		console.log(`\nThe following packages can be upgraded:\n`);
		for (const u of upgrades) {
			console.log(
				`  ${chalk.cyan(u.name)}  ${chalk.gray(u.current)} ${chalk.white("→")} ${chalk.green(u.latest)}`,
			);
		}
		console.log();
	}

	let confirmed = options.yes;
	if (!confirmed) {
		const response = await prompts({
			type: "confirm",
			name: "confirmed",
			message:
				renames.length > 0
					? "Do you want to apply these changes?"
					: "Do you want to upgrade these packages?",
			initial: true,
		});
		confirmed = response.confirmed;
	}

	if (!confirmed) {
		console.log("Upgrade cancelled.");
		return;
	}

	const { packageManager } = await detectPackageManager(cwd, packageJson);

	const installSpinner = yoctoSpinner({
		text:
			renames.length > 0
				? "applying renames and updates..."
				: "installing updates...",
	}).start();

	try {
		if (renames.length > 0) {
			await removeDependencies({
				dependencies: renames.map((r) => r.oldName),
				packageManager,
				cwd,
			});
			const prodRenames = renames
				.filter((r) => r.depType === "prod")
				.map((r) => `${r.newName}@${r.latest}`);
			const devRenames = renames
				.filter((r) => r.depType === "dev")
				.map((r) => `${r.newName}@${r.latest}`);
			if (prodRenames.length > 0) {
				await installDependencies({
					dependencies: prodRenames,
					packageManager,
					cwd,
					type: "prod",
				});
			}
			if (devRenames.length > 0) {
				await installDependencies({
					dependencies: devRenames,
					packageManager,
					cwd,
					type: "dev",
				});
			}
		}

		const prodUpgrades = upgrades
			.filter((u) => u.depType === "prod")
			.map((u) => `${u.name}@${u.latest}`);
		const devUpgrades = upgrades
			.filter((u) => u.depType === "dev")
			.map((u) => `${u.name}@${u.latest}`);

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

export { upgradeAction };
