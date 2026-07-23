import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { assertCoverageInventory } from "./lib/typecheck-coverage.mjs";

function runPnpm(cwd, label, args) {
	console.log(`\n==> ${label}`);
	const result = spawnSync("pnpm", args, { cwd, stdio: "inherit" });
	if (result.error) {
		console.error(`${label}: ${result.error.message}`);
		return false;
	}
	return result.status === 0;
}

const root = process.cwd();
const inventory = assertCoverageInventory(root);
const entries = [...inventory.manifest.packages, ...inventory.manifest.tests]
	.filter((entry) => entry.verification?.kind === "semantic-typecheck")
	.sort((left, right) => left.path.localeCompare(right.path));

let passed = true;
for (const entry of entries) {
	const runner = entry.verification.runner;
	const cwd = join(root, runner.cwd);
	for (const step of runner.prepare ?? []) {
		passed =
			runPnpm(cwd, `${entry.path}: ${step.label}`, step.command) && passed;
		if (!passed) break;
	}
	if (!passed) break;
	passed = runPnpm(cwd, `${entry.path}: semantic typecheck`, runner.command);
	if (!passed) break;
}

if (!passed) {
	process.exitCode = 1;
} else {
	console.log(`\nSemantic test typechecks: ${entries.length} passed.`);
}
