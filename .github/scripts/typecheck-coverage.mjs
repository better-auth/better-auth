import { assertCoverageInventory } from "./lib/typecheck-coverage.mjs";

try {
	const inventory = assertCoverageInventory(process.cwd());
	console.log(
		`Typecheck coverage inventory: ${inventory.workspacePaths.length} pnpm workspaces and ${inventory.tsconfigFiles.length} TypeScript configs.`,
	);
	console.log(
		`Root project-reference coverage: ${inventory.manifest.packages.filter((entry) => entry.role === "source").length} package source configs.`,
	);
	const semanticTests = [
		...inventory.manifest.packages,
		...inventory.manifest.tests,
	].filter((entry) => entry.verification?.kind === "semantic-typecheck");
	const runtimeOnlyTests = inventory.manifest.tests.filter(
		(entry) => entry.verification?.kind === "transpile-runtime-only",
	);
	console.log(
		`Semantic test coverage: ${semanticTests.length} direct typechecks. Runtime/transpile-only test configs: ${runtimeOnlyTests.length}; they are excluded from semantic coverage claims.`,
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
