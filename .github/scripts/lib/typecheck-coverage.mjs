import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";

const manifestPath = "typecheck.coverage.json";
const groupRoles = {
	rootConfigs: new Set(["shared-base", "declaration-check", "root-build"]),
	packages: new Set(["source", "test-only"]),
	consumers: new Set(["checked", "contract-check", "solution"]),
	tests: new Set(["test-fixture", "test-runner"]),
	workspaces: new Set([
		"consumer",
		"package-source",
		"root",
		"test-fixture",
		"test-helper",
		"test-runner",
	]),
};

function listTsconfigFiles(root) {
	const files = [];
	const directories = [root];

	while (directories.length) {
		const directory = directories.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (
					[".git", ".next", ".turbo", "dist", "node_modules"].includes(
						entry.name,
					)
				) {
					continue;
				}
				directories.push(path);
			} else if (
				entry.isFile() &&
				entry.name.startsWith("tsconfig") &&
				entry.name.endsWith(".json")
			) {
				files.push(relativePath(root, path));
			}
		}
	}

	return files.sort();
}

function listWorkspacePaths(root) {
	const result = spawnSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
		cwd: root,
		encoding: "utf8",
	});
	if (result.error || result.status !== 0) {
		throw new Error(
			`Could not read pnpm workspace inventory: ${result.error?.message ?? result.stderr}`,
		);
	}

	const workspaces = JSON.parse(result.stdout);
	if (!Array.isArray(workspaces)) {
		throw new Error("pnpm workspace inventory must be an array");
	}

	return workspaces
		.map((workspace) =>
			workspace.path === root ? "." : relativePath(root, workspace.path),
		)
		.sort();
}

export function parseJsonWithComments(path) {
	const result = ts.readConfigFile(path, ts.sys.readFile);
	if (result.error) {
		throw new Error(
			ts.flattenDiagnosticMessageText(result.error.messageText, "\n"),
		);
	}
	return result.config;
}

function relativePath(root, path) {
	return relative(root, path).replaceAll("\\", "/");
}

function assertStringArray(value, field, entryPath) {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some((item) => typeof item !== "string" || item.length === 0)
	) {
		throw new Error(`${entryPath}: ${field} must be a non-empty string array`);
	}
}

function assertReason(entry) {
	if (typeof entry.reason !== "string" || entry.reason.length === 0) {
		throw new Error(`${entry.path}: ${entry.role} entries require a reason`);
	}
}

function assertRole(group, entry) {
	if (!groupRoles[group].has(entry.role)) {
		throw new Error(`${entry.path}: unsupported ${group} role ${entry.role}`);
	}
}

export function semanticTypecheckRunner(entry) {
	return {
		command: ["exec", "tsc", "--noEmit", "--project", entry.path],
		cwd: ".",
		prepare: entry.verification.prepare ?? [],
	};
}

export function assertRootPackageReferences(
	rootReferencePaths,
	sourceConfigPaths,
) {
	const rootReferences = new Set(rootReferencePaths);
	const omissions = sourceConfigPaths.filter(
		(path) => !rootReferences.has(path),
	);
	if (omissions.length > 0) {
		throw new Error(
			`root tsconfig is missing package source references:\n${omissions
				.map((path) => `  ${path}`)
				.join("\n")}`,
		);
	}
}

function assertSemanticVerification(entry) {
	if (entry.verification.runner !== undefined) {
		throw new Error(
			`${entry.path}: semantic typecheck commands are derived from the config path`,
		);
	}
	for (const step of entry.verification.prepare ?? []) {
		if (typeof step?.label !== "string") {
			throw new Error(
				`${entry.path}: verification.prepare steps require a label`,
			);
		}
		assertStringArray(step.command, "verification.prepare.command", entry.path);
	}
}

function assertVerification(entry, runtimeOwnerIds) {
	if (entry.verification?.kind === "semantic-typecheck") {
		assertSemanticVerification(entry);
		return;
	}
	if (entry.verification?.kind === "transpile-runtime-only") {
		if (typeof entry.verification.owner !== "string") {
			throw new Error(
				`${entry.path}: transpile-runtime-only entries require an owner`,
			);
		}
		if (!runtimeOwnerIds.has(entry.verification.owner)) {
			throw new Error(
				`${entry.path}: unknown runtime owner ${entry.verification.owner}`,
			);
		}
		return;
	}
	throw new Error(
		`${entry.path}: entries require semantic-typecheck or transpile-runtime-only verification`,
	);
}

function assertSolutionConfig(root, entry, semanticConfigPaths) {
	const config = parseJsonWithComments(join(root, entry.path));
	if (!Array.isArray(config.files) || config.files.length !== 0) {
		throw new Error(`${entry.path}: solution configs must declare files: []`);
	}
	if (config.include !== undefined) {
		throw new Error(`${entry.path}: solution configs may not declare include`);
	}
	if (!Array.isArray(config.references) || config.references.length === 0) {
		throw new Error(
			`${entry.path}: solution configs require project references`,
		);
	}
	const configDirectory = resolve(root, entry.path, "..");
	for (const reference of config.references) {
		if (typeof reference?.path !== "string" || reference.path.length === 0) {
			throw new Error(`${entry.path}: solution references require a path`);
		}
		const target = reference.path.endsWith(".json")
			? resolve(configDirectory, reference.path)
			: resolve(configDirectory, reference.path, "tsconfig.json");
		const targetPath = relativePath(root, target);
		if (!semanticConfigPaths.has(targetPath)) {
			throw new Error(
				`${entry.path}: solution reference ${targetPath} is not semantically checked`,
			);
		}
	}
}

export function assertConsumerRunner(root, entry, buildIds) {
	const runner = entry.runner;
	if (!runner || typeof runner.cwd !== "string") {
		throw new Error(`${entry.path}: ${entry.role} entries require a runner`);
	}
	const runnerRoot = resolve(root, runner.cwd);
	const relativeRunnerRoot = relative(root, runnerRoot);
	if (relativeRunnerRoot.startsWith("..") || isAbsolute(relativeRunnerRoot)) {
		throw new Error(
			`${entry.path}: runner.cwd must stay within the repository`,
		);
	}
	if (!buildIds.has(runner.build)) {
		throw new Error(`${entry.path}: unknown consumer build ${runner.build}`);
	}
	assertStringArray(runner.command, "runner.command", entry.path);
	if (runner.command[0] !== "exec" || runner.command[1] !== "tsc") {
		throw new Error(
			`${entry.path}: runner.command must invoke the consumer-local compiler with pnpm exec tsc`,
		);
	}

	const projectIndex = runner.command.findIndex(
		(argument) => argument === "--project" || argument === "-p",
	);
	const expectedProject = relativePath(
		join(root, runner.cwd),
		join(root, entry.path),
	);
	if (
		projectIndex === -1 ||
		runner.command[projectIndex + 1] !== expectedProject
	) {
		throw new Error(
			`${entry.path}: runner.command must select ${expectedProject} from ${runner.cwd}`,
		);
	}

	for (const step of runner.prepare ?? []) {
		if (typeof step?.label !== "string") {
			throw new Error(`${entry.path}: runner.prepare steps require a label`);
		}
		assertStringArray(step.command, "runner.prepare.command", entry.path);
	}

	for (const path of runner.cleanPaths ?? []) {
		if (
			typeof path !== "string" ||
			path.length === 0 ||
			path.startsWith("/") ||
			path.split("/").includes("..")
		) {
			throw new Error(`${entry.path}: unsafe runner.cleanPaths entry ${path}`);
		}
		const target = resolve(runnerRoot, path);
		const relativeTarget = relative(runnerRoot, target);
		if (
			relativeTarget === "" ||
			relativeTarget.startsWith("..") ||
			isAbsolute(relativeTarget)
		) {
			throw new Error(`${entry.path}: unsafe runner.cleanPaths entry ${path}`);
		}
	}

	if (
		runner.candidatePackage !== undefined &&
		typeof runner.candidatePackage !== "string"
	) {
		throw new Error(`${entry.path}: runner.candidatePackage must be a string`);
	}
	if (entry.role === "contract-check") {
		if (
			typeof runner.candidatePackage !== "string" ||
			runner.candidatePackage.length === 0
		) {
			throw new Error(
				`${entry.path}: contract-check entries require runner.candidatePackage`,
			);
		}
		if (
			!Array.isArray(runner.candidateWorkspacePackages) ||
			runner.candidateWorkspacePackages.length === 0
		) {
			throw new Error(
				`${entry.path}: contract-check entries require runner.candidateWorkspacePackages`,
			);
		}
	}
	const protectedCandidatePackages = new Set(
		typeof runner.candidatePackage === "string"
			? [runner.candidatePackage]
			: [],
	);
	for (const packagePath of runner.candidateWorkspacePackages ?? []) {
		if (
			typeof packagePath !== "string" ||
			packagePath.length === 0 ||
			packagePath.startsWith("/") ||
			packagePath.split("/").includes("..")
		) {
			throw new Error(
				`${entry.path}: unsafe runner.candidateWorkspacePackages entry ${packagePath}`,
			);
		}
		const packageRoot = resolve(root, packagePath);
		const relativePackageRoot = relative(root, packageRoot);
		if (
			relativePackageRoot === "" ||
			relativePackageRoot.startsWith("..") ||
			isAbsolute(relativePackageRoot) ||
			!existsSync(join(packageRoot, "package.json"))
		) {
			throw new Error(
				`${entry.path}: invalid runner.candidateWorkspacePackages entry ${packagePath}`,
			);
		}
		const packageManifest = JSON.parse(
			readFileSync(join(packageRoot, "package.json"), "utf8"),
		);
		if (
			typeof packageManifest.name !== "string" ||
			packageManifest.name.length === 0
		) {
			throw new Error(
				`${entry.path}: candidate workspace package ${packagePath} has no package name`,
			);
		}
		protectedCandidatePackages.add(packageManifest.name);
	}
	for (const packageName of runner.candidateAllowedFamilyNodeModulesPackages ??
		[]) {
		if (
			typeof packageName !== "string" ||
			(packageName !== "better-auth" &&
				!packageName.startsWith("@better-auth/"))
		) {
			throw new Error(
				`${entry.path}: invalid runner.candidateAllowedFamilyNodeModulesPackages entry ${packageName}`,
			);
		}
		if (protectedCandidatePackages.has(packageName)) {
			throw new Error(
				`${entry.path}: runner.candidateAllowedFamilyNodeModulesPackages may not allow candidate or workspace package ${packageName}`,
			);
		}
	}
}

function assertManifestEntries(root, manifest) {
	const declaredConfigs = new Set();
	const declaredWorkspaces = new Set();
	const buildIds = new Set();
	const runtimeOwnerIds = new Set();

	for (const owner of manifest.testOwners) {
		if (
			typeof owner?.id !== "string" ||
			runtimeOwnerIds.has(owner.id) ||
			typeof owner.workflow !== "string" ||
			owner.workflow.startsWith("/") ||
			owner.workflow.split("/").includes("..")
		) {
			throw new Error(`${manifestPath}: invalid or duplicate test owner`);
		}
		assertStringArray(owner.command, "command", owner.id);
		const workflowPath = resolve(root, owner.workflow);
		if (!existsSync(workflowPath)) {
			throw new Error(`${owner.id}: runtime owner workflow does not exist`);
		}
		const expectedCommand = `pnpm ${owner.command.join(" ")}`;
		if (!readFileSync(workflowPath, "utf8").includes(expectedCommand)) {
			throw new Error(
				`${owner.id}: runtime owner workflow does not execute ${expectedCommand}`,
			);
		}
		runtimeOwnerIds.add(owner.id);
	}

	for (const build of manifest.consumerBuilds) {
		if (
			typeof build?.id !== "string" ||
			typeof build.cwd !== "string" ||
			buildIds.has(build.id)
		) {
			throw new Error(`${manifestPath}: invalid or duplicate consumer build`);
		}
		assertStringArray(build.command, "command", build.id);
		const buildRoot = resolve(root, build.cwd);
		const relativeBuildRoot = relative(root, buildRoot);
		if (
			relativeBuildRoot.startsWith("..") ||
			isAbsolute(relativeBuildRoot) ||
			build.command[0] !== "exec" ||
			build.command[1] !== "turbo" ||
			build.command[2] !== "run" ||
			build.command[3] !== "build"
		) {
			throw new Error(`${build.id}: invalid consumer build runner semantics`);
		}
		buildIds.add(build.id);
	}

	for (const group of ["rootConfigs", "packages", "consumers", "tests"]) {
		for (const entry of manifest[group]) {
			if (typeof entry?.path !== "string" || typeof entry.role !== "string") {
				throw new Error(`${manifestPath}: invalid ${group} entry`);
			}
			assertRole(group, entry);
			if (declaredConfigs.has(entry.path)) {
				throw new Error(`${entry.path}: duplicate TypeScript coverage`);
			}
			declaredConfigs.add(entry.path);

			if (group === "consumers") {
				if (entry.role === "checked" || entry.role === "contract-check") {
					assertConsumerRunner(root, entry, buildIds);
				} else {
					assertReason(entry);
					if (entry.runner !== undefined) {
						throw new Error(
							`${entry.path}: ${entry.role} entries cannot declare a runner`,
						);
					}
				}
			} else if (group === "packages" && entry.role === "source") {
				if (entry.runner !== undefined) {
					throw new Error(
						`${entry.path}: source coverage is owned by the root project-reference graph`,
					);
				}
			} else if (group === "packages" && entry.role === "test-only") {
				assertReason(entry);
				assertVerification(entry, runtimeOwnerIds);
			} else if (group === "tests") {
				assertReason(entry);
				assertVerification(entry, runtimeOwnerIds);
			} else {
				assertReason(entry);
			}
		}
	}

	const semanticConfigPaths = new Set([
		...manifest.packages
			.filter(
				(entry) =>
					entry.role === "source" ||
					entry.verification?.kind === "semantic-typecheck",
			)
			.map((entry) => entry.path),
		...manifest.consumers
			.filter((entry) => entry.role === "checked")
			.map((entry) => entry.path),
		...manifest.tests
			.filter((entry) => entry.verification?.kind === "semantic-typecheck")
			.map((entry) => entry.path),
	]);
	for (const entry of [
		...manifest.consumers.filter((entry) => entry.role === "solution"),
		...manifest.tests.filter((entry) => entry.solution === true),
	]) {
		assertSolutionConfig(root, entry, semanticConfigPaths);
	}

	for (const entry of manifest.workspaces) {
		if (typeof entry?.path !== "string" || typeof entry.role !== "string") {
			throw new Error(`${manifestPath}: invalid workspace entry`);
		}
		assertRole("workspaces", entry);
		assertReason(entry);
		if (declaredWorkspaces.has(entry.path)) {
			throw new Error(`${entry.path}: duplicate workspace coverage`);
		}
		declaredWorkspaces.add(entry.path);
	}

	return { declaredConfigs, declaredWorkspaces };
}

export function loadCoverageManifest(root) {
	const path = join(root, manifestPath);
	if (!existsSync(path)) {
		throw new Error(`Missing ${manifestPath}`);
	}

	const manifest = JSON.parse(readFileSync(path, "utf8"));
	if (
		!Array.isArray(manifest.consumerBuilds) ||
		!Array.isArray(manifest.packages) ||
		!Array.isArray(manifest.consumers) ||
		!Array.isArray(manifest.rootConfigs) ||
		!Array.isArray(manifest.tests) ||
		!Array.isArray(manifest.testOwners) ||
		!Array.isArray(manifest.workspaces)
	) {
		throw new Error(
			`${manifestPath}: consumerBuilds, rootConfigs, packages, consumers, tests, testOwners, and workspaces must be arrays`,
		);
	}

	return manifest;
}

export function assertCoverageInventory(root) {
	const manifest = loadCoverageManifest(root);
	const tsconfigFiles = listTsconfigFiles(root);
	const workspacePaths = listWorkspacePaths(root);
	const { declaredConfigs, declaredWorkspaces } = assertManifestEntries(
		root,
		manifest,
	);
	const expectedConfigs = new Set(tsconfigFiles);
	const expectedWorkspaces = new Set(workspacePaths);
	const missingConfigs = [...expectedConfigs].filter(
		(path) => !declaredConfigs.has(path),
	);
	const staleConfigs = [...declaredConfigs].filter(
		(path) => !expectedConfigs.has(path),
	);
	const missingWorkspaces = [...expectedWorkspaces].filter(
		(path) => !declaredWorkspaces.has(path),
	);
	const staleWorkspaces = [...declaredWorkspaces].filter(
		(path) => !expectedWorkspaces.has(path),
	);

	if (
		missingConfigs.length ||
		staleConfigs.length ||
		missingWorkspaces.length ||
		staleWorkspaces.length
	) {
		const lines = [
			...missingConfigs.map((path) => `missing TypeScript coverage: ${path}`),
			...staleConfigs.map((path) => `stale TypeScript coverage: ${path}`),
			...missingWorkspaces.map((path) => `missing workspace coverage: ${path}`),
			...staleWorkspaces.map((path) => `stale workspace coverage: ${path}`),
		];
		throw new Error(lines.join("\n"));
	}

	const rootConfig = parseJsonWithComments(join(root, "tsconfig.json"));
	const rootReferences = new Set(
		(rootConfig.references ?? []).map((reference) =>
			relativePath(root, join(root, reference.path)),
		),
	);
	const sourceConfigs = manifest.packages
		.filter((entry) => entry.role === "source")
		.map((entry) => entry.path);
	assertRootPackageReferences(rootReferences, sourceConfigs);

	return {
		tsconfigFiles,
		workspacePaths,
		manifest,
	};
}
