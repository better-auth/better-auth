import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
	createPolicy,
	findHighRiskAdditions,
	formatInventory,
	loadPolicy,
	scanRepository,
	validatePolicy,
} from "./lib/type-safety-audit.mjs";

const root = process.cwd();
const checking = process.argv.includes("--check");

function mergeBasePolicy() {
	const target = process.env.GITHUB_BASE_REF
		? `origin/${process.env.GITHUB_BASE_REF}`
		: "origin/next";
	const mergeBase = spawnSync("git", ["merge-base", "HEAD", target], {
		cwd: root,
		encoding: "utf8",
	});
	if (mergeBase.error || mergeBase.status !== 0) return undefined;
	const revision = mergeBase.stdout.trim();
	const policy = spawnSync(
		"git",
		["show", `${revision}:.github/type-safety-policy.json`],
		{ cwd: root, encoding: "utf8" },
	);
	if (policy.error || policy.status !== 0) return undefined;
	return validatePolicy(
		JSON.parse(policy.stdout),
		`${revision}:.github/type-safety-policy.json`,
	);
}

const baselinePolicy = checking
	? (mergeBasePolicy() ?? loadPolicy(root))
	: undefined;
const inventory = scanRepository(root);

if (process.argv.includes("--write-policy")) {
	writeFileSync(
		".github/type-safety-policy.json",
		`${JSON.stringify(createPolicy(inventory), null, 2)}\n`,
	);
	console.log("Wrote .github/type-safety-policy.json");
}

if (!checking) {
	console.log(formatInventory(inventory));
} else {
	console.log(
		`Type safety baseline check: ${inventory.sourceFileCount} source files, ${inventory.tsconfigCount} tsconfig files, ${inventory.occurrences.length} occurrences.`,
	);
}

if (checking) {
	const additions = findHighRiskAdditions(inventory, baselinePolicy);
	if (additions.length) {
		console.error("New high-risk production escape hatches:");
		for (const entry of additions) {
			console.error(
				`  ${entry.path}:${entry.line}:${entry.column} ${entry.category} fingerprint=${entry.fingerprint}`,
			);
		}
		process.exitCode = 1;
	}
}
