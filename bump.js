#!/usr/bin/env node
import { exec, execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const pkgs = readdirSync("packages").filter((pkg) => !pkg.startsWith("."));
const _rl = readline.createInterface({ input, output });

function getPackageVersion(pkgPath = "package.json") {
	return JSON.parse(readFileSync(pkgPath, "utf-8"));
}

async function getNextVersion(path = ".") {
	try {
		// Prompt user synchronously
		try {
			const currentPkg = getPackageVersion(`${path}/package.json`);
			console.log(`Update ${currentPkg.name}:`);
			execSync(
				`cd ${path} && npx bumpp package.json --no-commit --no-tag --push=false -y`,
				{ stdio: "inherit" },
			);
		} catch (error) {
			console.error(error);
			process.exit(1);
		}

		const updatedPkg = getPackageVersion(`${path}/package.json`);
		return {
			nextVersion: updatedPkg.version,
			pkgName: updatedPkg.name,
			pkgPath: path,
		};
	} catch (err) {
		console.error(`Failed to calculate next version for ${path}:`, err);
		return null;
	}
}

async function main() {
	const results = [];
	for (const pkg of pkgs) {
		results.push(await getNextVersion(`packages/${pkg}`));
	}

	const versions = results.filter(Boolean);
	console.log(versions);

	// Commit all changes and tag
	await execAsync(
		`git add package.json ${versions.map((v) => v.pkgPath + "/package.json").join(" ")}`,
		{ stdio: "inherit" },
	);

	const commitMessage = versions
		.map((v) => `chore: release ${v.pkgName}@v${v.nextVersion}`)
		.join(" && ");

	await execAsync(`git commit -m "${commitMessage}"`, { stdio: "inherit" });
	await execAsync(`git tag v${rootVersion.nextVersion}`, { stdio: "inherit" });

	console.log(`Packages bumped on v${rootVersion.nextVersion}:`);
	console.log(versions.map((v) => `v${v.nextVersion}\n`));
}

await main();
