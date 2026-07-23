import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCoverageInventory } from "./lib/typecheck-coverage.mjs";

function run(root, label, args) {
	console.log(`\n==> ${label}`);
	const result = spawnSync("pnpm", args, {
		cwd: root,
		stdio: "inherit",
	});
	if (result.error) {
		console.error(`${label}: ${result.error.message}`);
		return false;
	}
	return result.status === 0;
}

try {
	const root = process.cwd();
	const inventory = assertCoverageInventory(root);
	const sourceConfigs = inventory.manifest.packages.filter(
		(entry) => entry.role === "source",
	);

	const solutionDirectory = mkdtempSync(
		join(tmpdir(), "better-auth-typecheck-"),
	);
	const solutionPath = join(solutionDirectory, "tsconfig.json");
	writeFileSync(
		solutionPath,
		`${JSON.stringify(
			{
				files: [],
				references: sourceConfigs.map((entry) => ({
					path: join(root, entry.path),
				})),
			},
			null,
			2,
		)}\n`,
	);

	const passed = run(root, "package source solution", [
		"exec",
		"tsc",
		"--build",
		"--force",
		solutionPath,
	]);
	rmSync(solutionDirectory, { recursive: true, force: true });

	if (!passed) {
		console.error(
			"Package typecheck coverage is blocked by the source solution.",
		);
		process.exitCode = 1;
	} else {
		console.log(`Checked ${sourceConfigs.length} package source configs.`);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
