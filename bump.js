#!/usr/bin/env node
import { exec } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const releaseType = process.argv[2] || "prerelease";
const pkgs = readdirSync("packages").filter((pkg) => !pkg.startsWith("."));

async function getPackageVersion(pkg) {
	return JSON.parse(readFileSync(pkg, "utf-8"));
}

async function getNextVersion(path = ".") {
	try {
		await execAsync(
			/* cspell:disable-next-line */
			`cd ${path} && npx bumpp package.json --release ${releaseType} --no-commit --no-tag --push false -y`,
		);
		const pkg = await getPackageVersion(`${path}/package.json`);
		return {
			nextVersion: pkg.version,
			pkgName: pkg.name,
			pkgPath: path,
		};
	} catch (err) {
		console.error(`Failed to calculate next version for ${path}:`, err);
		return null;
	}
}

async function main() {
	const rootVersion = await getNextVersion();
	// Calculate next versions in parallel
	const results = await Promise.all(
		pkgs.map((pkg) => getNextVersion(`packages/${pkg}`)),
	);
	const versions = results.filter(Boolean);
	console.log(versions);

	// Commit all changes and tag
	await execAsync(
		`git add package.json ${versions.map((v) => v.pkgPath + "/package.json").join(" ")}`,
	);
	await execAsync(
		`git commit -m "chore: release ${rootVersion.nextVersion}" ${versions.map((v) => `-m "chore: release ${v.pkgName}@v${v.nextVersion}"`).join(" ")}`,
	);
	await execAsync(`git tag ${rootVersion.nextVersion}`);

	console.log("All packages bumped, committed, and tagged!");
}

await main();
