import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { assertCoverageInventory } from "./lib/typecheck-coverage.mjs";

function parseArguments(argv) {
	const options = {
		clean: false,
		dashOnly: false,
		infraCandidate: undefined,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--clean") {
			options.clean = true;
		} else if (argument === "--dash") {
			options.dashOnly = true;
		} else if (argument === "--infra-candidate") {
			const path = argv[index + 1];
			if (!path || path.startsWith("--")) {
				throw new Error("--infra-candidate requires a package directory");
			}
			options.infraCandidate = path;
			options.dashOnly = true;
			index += 1;
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}

	return options;
}

function runPnpm(cwd, label, args, capture = false) {
	console.log(`\n==> ${label}`);
	const result = spawnSync("pnpm", args, {
		cwd,
		encoding: capture ? "utf8" : undefined,
		stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
	});
	if (result.error) {
		console.error(`${label}: ${result.error.message}`);
		return { passed: false, stdout: "" };
	}
	return {
		passed: result.status === 0,
		stdout: capture ? result.stdout : "",
	};
}

function uniqueBy(items, keyFor) {
	const seen = new Set();
	return items.filter((item) => {
		const key = keyFor(item);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function cleanBuildOutputs(root, build) {
	const cwd = join(root, build.cwd);
	const dryRun = runPnpm(
		cwd,
		`${build.id} output inventory`,
		[...build.command, "--dry=json"],
		true,
	);
	if (!dryRun.passed) return false;

	const inventory = JSON.parse(dryRun.stdout);
	for (const task of inventory.tasks ?? []) {
		for (const output of task.outputs ?? []) {
			const outputRoot = output.split("*", 1)[0].replace(/\/$/, "");
			if (!outputRoot) continue;
			const taskRoot = resolve(cwd, task.directory);
			const target = resolve(taskRoot, outputRoot);
			const relativeOutput = relative(taskRoot, target);
			const relativeTarget = relative(root, target);
			if (
				relativeOutput === "" ||
				relativeOutput.startsWith("..") ||
				isAbsolute(relativeOutput) ||
				relativeTarget === "" ||
				relativeTarget.startsWith("..") ||
				isAbsolute(relativeTarget)
			) {
				throw new Error(`Refusing to clean unsafe build output: ${target}`);
			}
			console.warn(`cleaning ${relativeTarget}`);
			rmSync(target, { recursive: true, force: true });
		}
	}
	return true;
}

function cleanConsumerOutputs(root, entries) {
	for (const entry of entries) {
		for (const path of entry.runner.cleanPaths ?? []) {
			const runnerRoot = resolve(root, entry.runner.cwd);
			const target = resolve(runnerRoot, path);
			const relativeTarget = relative(runnerRoot, target);
			if (
				relativeTarget === "" ||
				relativeTarget.startsWith("..") ||
				isAbsolute(relativeTarget)
			) {
				throw new Error(`Refusing to clean unsafe consumer output: ${target}`);
			}
			console.warn(`cleaning ${relative(root, target)}`);
			rmSync(target, { recursive: true, force: true });
		}
	}
}

function isPathInside(root, path) {
	const relation = relative(root, path);
	return relation !== "" && !relation.startsWith("..") && !isAbsolute(relation);
}

export function normalizePath(path) {
	return path.replaceAll("\\", "/");
}

function resolvePackageTarget(packageRoot, target, label) {
	if (typeof target !== "string" || target.length === 0) {
		throw new Error(`${label} must declare a non-empty type target`);
	}
	const resolved = resolve(packageRoot, target);
	if (!isPathInside(packageRoot, resolved)) {
		throw new Error(`${label} escapes its package directory`);
	}
	return resolved;
}

function assertCanonicalPackageTarget(packageRoot, path, label) {
	const canonicalRoot = realpathSync(packageRoot);
	const canonicalTarget = realpathSync(path);
	if (!isPathInside(canonicalRoot, canonicalTarget)) {
		throw new Error(`${label} resolves outside its package directory`);
	}
	return canonicalTarget;
}

function matchingWildcardTargets(wildcardRoot, target, packageRoot, label) {
	const normalizedTarget = normalizePath(target.replace(/^\.\//, ""));
	const expression = new RegExp(
		`^${normalizedTarget
			.split("*")
			.map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"))
			.join(".*")}$`,
	);
	const matches = [];
	const directories = [wildcardRoot];
	while (directories.length) {
		const directory = directories.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				throw new Error(
					`${label} wildcard target tree may not contain symlinks: ${path}`,
				);
			}
			if (entry.isDirectory()) {
				directories.push(path);
			} else if (
				entry.isFile() &&
				expression.test(normalizePath(relative(packageRoot, path)))
			) {
				matches.push(path);
			}
		}
	}
	if (matches.length === 0) {
		throw new Error(`${label} wildcard target matches no declaration files`);
	}
	for (const match of matches) {
		assertCanonicalPackageTarget(packageRoot, match, label);
	}
}

function assertDeclarationTarget(packageRoot, target, label) {
	const resolved = resolvePackageTarget(packageRoot, target, label);
	const wildcardIndex = target.indexOf("*");
	if (wildcardIndex === -1) {
		if (!existsSync(resolved)) {
			throw new Error(`${label} does not exist: ${resolved}`);
		}
		assertCanonicalPackageTarget(packageRoot, resolved, label);
		return resolved;
	}
	if (target.indexOf("*", wildcardIndex + 1) !== -1) {
		throw new Error(`${label} may contain only one wildcard target`);
	}
	const wildcardRoot = resolvePackageTarget(
		packageRoot,
		target.slice(0, wildcardIndex),
		label,
	);
	if (!existsSync(wildcardRoot)) {
		throw new Error(`${label} wildcard root does not exist: ${wildcardRoot}`);
	}
	assertCanonicalPackageTarget(packageRoot, wildcardRoot, label);
	matchingWildcardTargets(wildcardRoot, target, packageRoot, label);
	return resolved;
}

function exportTypeTarget(conditions) {
	if (typeof conditions === "string") {
		return /\.d\.[cm]?ts$/.test(conditions) ? conditions : undefined;
	}
	return typeof conditions?.types === "string" ? conditions.types : undefined;
}

export function packageTypePaths(packageRoot) {
	const packageManifest = JSON.parse(
		readFileSync(join(packageRoot, "package.json"), "utf8"),
	);
	if (
		typeof packageManifest.name !== "string" ||
		packageManifest.name.length === 0
	) {
		throw new Error(`${packageRoot} has no package name`);
	}
	const rootTypePath = assertDeclarationTarget(
		packageRoot,
		packageManifest.types,
		`${packageManifest.name} package.json types`,
	);
	const paths = {};
	paths[packageManifest.name] = [rootTypePath];

	for (const [exportPath, conditions] of Object.entries(
		packageManifest.exports ?? {},
	)) {
		const typePath = exportTypeTarget(conditions);
		if (typeof typePath !== "string") continue;
		const declarationPath = assertDeclarationTarget(
			packageRoot,
			typePath,
			`${packageManifest.name} export ${exportPath}`,
		);

		if (exportPath === ".") {
			if (declarationPath !== rootTypePath) {
				throw new Error(
					`${packageManifest.name} root export types must match package.json types`,
				);
			}
			continue;
		}
		if (!exportPath.startsWith("./")) {
			throw new Error(
				`${packageManifest.name} has an unsupported export path ${exportPath}`,
			);
		}
		const specifier = `${packageManifest.name}${exportPath.slice(1)}`;
		paths[specifier] = [declarationPath];
	}

	return { name: packageManifest.name, paths, root: packageRoot, rootTypePath };
}

function canonicalPath(path) {
	return existsSync(path) ? realpathSync(path) : resolve(path);
}

function listResolvedFiles(stdout) {
	return stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => existsSync(line))
		.map((raw) => ({ raw, canonical: canonicalPath(raw) }));
}

function importedFamilyPackages(files) {
	const imported = new Set();
	for (const path of files) {
		for (const reference of ts.preProcessFile(readFileSync(path, "utf8"))
			.importedFiles) {
			if (
				reference.fileName === "better-auth" ||
				reference.fileName.startsWith("@better-auth/")
			) {
				imported.add(reference.fileName);
			}
		}
	}
	return imported;
}

function importsPackage(imports, packageName) {
	return [...imports].some(
		(specifier) =>
			specifier === packageName || specifier.startsWith(`${packageName}/`),
	);
}

function nodeModulesPackageName(path) {
	const normalized = normalizePath(path);
	const marker = "/node_modules/";
	const index = normalized.lastIndexOf(marker);
	if (index === -1) return undefined;
	const segments = normalized.slice(index + marker.length).split("/");
	if (segments[0]?.startsWith("@")) {
		return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : undefined;
	}
	return segments[0];
}

function isFamilyNodeModulesOrigin(path) {
	const packageName = nodeModulesPackageName(path);
	return (
		packageName === "better-auth" ||
		packageName?.startsWith("@better-auth/") === true
	);
}

function isAllowedFamilyNodeModulesOrigin(path, allowedPackages) {
	return allowedPackages.includes(nodeModulesPackageName(path));
}

function isForbiddenFamilyNodeModulesOrigin(path, allowedPackages) {
	return (
		isFamilyNodeModulesOrigin(path) &&
		!isAllowedFamilyNodeModulesOrigin(path, allowedPackages)
	);
}

export function assertCandidateOrigins(consumerRoot, context, stdout) {
	const files = listResolvedFiles(stdout);
	if (
		!files.some(
			(file) =>
				file.canonical === canonicalPath(context.candidate.rootTypePath),
		)
	) {
		throw new Error(
			`Candidate declaration was not loaded: ${context.candidate.rootTypePath}`,
		);
	}

	const candidateDeclarations = files
		.filter((file) => isPathInside(context.candidate.root, file.canonical))
		.map((file) => file.canonical);
	const imported = importedFamilyPackages(candidateDeclarations);
	const fallback = files.find(
		(file) =>
			isForbiddenFamilyNodeModulesOrigin(
				file.raw,
				context.allowedFamilyNodeModulesPackages,
			) ||
			isForbiddenFamilyNodeModulesOrigin(
				file.canonical,
				context.allowedFamilyNodeModulesPackages,
			),
	);
	if (fallback) {
		throw new Error(
			`Better Auth-family declaration resolved from a forbidden node_modules origin: ${fallback.raw}`,
		);
	}

	for (const workspacePackage of context.workspacePackages) {
		if (!importsPackage(imported, workspacePackage.name)) {
			console.log(
				`${workspacePackage.name} is an available workspace mapping; candidate declarations did not import it.`,
			);
			continue;
		}
		if (
			!files.some((file) => isPathInside(workspacePackage.root, file.canonical))
		) {
			throw new Error(
				`Candidate imports ${workspacePackage.name}, but no declaration resolved from ${workspacePackage.root}`,
			);
		}
		console.log(
			`Resolved ${workspacePackage.name} declarations from ${workspacePackage.root}`,
		);
	}
}

export function candidateCommand(
	root,
	entry,
	candidatePath,
	temporaryDirectories,
) {
	if (!entry.runner.candidatePackage) {
		throw new Error(`${entry.path} does not declare a candidate package`);
	}

	const candidate = realpathSync(resolve(candidatePath));
	const candidateManifest = JSON.parse(
		readFileSync(join(candidate, "package.json"), "utf8"),
	);
	if (candidateManifest.name !== entry.runner.candidatePackage) {
		throw new Error(
			`${candidate} is ${candidateManifest.name ?? "an unnamed package"}, expected ${entry.runner.candidatePackage}`,
		);
	}

	const consumerRoot = join(root, entry.runner.cwd);
	if (isPathInside(join(consumerRoot, "node_modules"), candidate)) {
		throw new Error(
			`${candidate} is the consumer's installed dependency, not a local candidate`,
		);
	}
	const candidateTypePaths = packageTypePaths(candidate);
	if (candidateTypePaths.name !== entry.runner.candidatePackage) {
		throw new Error(
			`${candidate} types belong to ${candidateTypePaths.name}, expected ${entry.runner.candidatePackage}`,
		);
	}
	const cacheRoot = join(consumerRoot, "node_modules/.cache");
	mkdirSync(cacheRoot, { recursive: true });
	const directory = mkdtempSync(join(cacheRoot, "better-auth-consumer-"));
	temporaryDirectories.push(directory);
	const configPath = join(directory, "tsconfig.json");
	const workspacePackages = entry.runner.candidateWorkspacePackages.map(
		(packagePath) => packageTypePaths(realpathSync(resolve(root, packagePath))),
	);
	const workspaceTypePaths = Object.assign(
		{},
		...workspacePackages.map((workspacePackage) => workspacePackage.paths),
	);
	writeFileSync(
		configPath,
		`${JSON.stringify(
			{
				extends: join(root, entry.path),
				compilerOptions: {
					baseUrl: consumerRoot,
					paths: {
						...workspaceTypePaths,
						...candidateTypePaths.paths,
					},
				},
			},
			null,
			2,
		)}\n`,
	);

	const command = [...entry.runner.command];
	const projectIndex = command.findIndex(
		(argument) => argument === "--project" || argument === "-p",
	);
	command[projectIndex + 1] = configPath;
	console.log(
		`Using local ${entry.runner.candidatePackage} candidate at ${candidate}`,
	);
	return {
		candidate: candidateTypePaths,
		command,
		configPath,
		consumerRoot,
		allowedFamilyNodeModulesPackages:
			entry.runner.candidateAllowedFamilyNodeModulesPackages ?? [],
		workspacePackages,
	};
}

export function main(argv = process.argv.slice(2)) {
	try {
		const root = process.cwd();
		const options = parseArguments(argv);
		const inventory = assertCoverageInventory(root);
		const selected = inventory.manifest.consumers.filter((entry) =>
			options.dashOnly
				? entry.role === "contract-check"
				: entry.role === "checked",
		);
		if (selected.length === 0) {
			throw new Error("No consumer configs matched the requested selection");
		}

		const buildsById = new Map(
			inventory.manifest.consumerBuilds.map((build) => [build.id, build]),
		);
		const builds = uniqueBy(
			selected.map((entry) => buildsById.get(entry.runner.build)),
			(build) => build.id,
		);

		if (options.clean) {
			console.warn(
				"\nClean consumer validation removes only outputs declared by the selected consumer package graph and generated consumer state.",
			);
			for (const build of builds) {
				if (!cleanBuildOutputs(root, build)) {
					process.exitCode = 1;
					break;
				}
			}
			if (process.exitCode !== 1) cleanConsumerOutputs(root, selected);
		}

		if (process.exitCode !== 1) {
			for (const build of builds) {
				const command = options.clean
					? [...build.command, "--force"]
					: build.command;
				if (
					!runPnpm(
						join(root, build.cwd),
						`${build.id} current-source declarations`,
						command,
					).passed
				) {
					process.exitCode = 1;
					break;
				}
			}
		}

		const preparationResults = new Map();
		if (process.exitCode !== 1) {
			const preparations = uniqueBy(
				selected.flatMap((entry) =>
					(entry.runner.prepare ?? []).map((step) => ({
						...step,
						cwd: entry.runner.cwd,
					})),
				),
				(step) => `${step.cwd}\0${step.command.join("\0")}`,
			);
			for (const step of preparations) {
				const key = `${step.cwd}\0${step.command.join("\0")}`;
				const passed = runPnpm(
					join(root, step.cwd),
					`${step.cwd}: ${step.label}`,
					step.command,
				).passed;
				preparationResults.set(key, passed);
			}
		}

		const temporaryDirectories = [];
		const failures = [];
		try {
			if (process.exitCode !== 1) {
				for (const entry of selected) {
					const blockedPreparation = (entry.runner.prepare ?? []).find(
						(step) =>
							preparationResults.get(
								`${entry.runner.cwd}\0${step.command.join("\0")}`,
							) === false,
					);
					if (blockedPreparation) {
						failures.push(`${entry.path} (${blockedPreparation.label} failed)`);
						continue;
					}

					const candidateContext =
						options.infraCandidate && entry.role === "contract-check"
							? candidateCommand(
									root,
									entry,
									options.infraCandidate,
									temporaryDirectories,
								)
							: undefined;
					const command = candidateContext?.command ?? entry.runner.command;
					if (
						!runPnpm(join(root, entry.runner.cwd), entry.path, command).passed
					) {
						failures.push(entry.path);
						continue;
					}
					if (candidateContext) {
						const resolution = runPnpm(
							join(root, entry.runner.cwd),
							`${entry.path} declaration origin inventory`,
							[...command, "--listFilesOnly"],
							true,
						);
						if (!resolution.passed) {
							failures.push(
								`${entry.path} (declaration origin inventory failed)`,
							);
							continue;
						}
						try {
							assertCandidateOrigins(
								candidateContext.consumerRoot,
								candidateContext,
								resolution.stdout,
							);
						} catch (error) {
							console.error(error instanceof Error ? error.message : error);
							failures.push(`${entry.path} (declaration origin proof failed)`);
						}
					}
				}
			}
		} finally {
			for (const directory of temporaryDirectories) {
				rmSync(directory, { recursive: true, force: true });
			}
		}

		if (failures.length) {
			console.error(`Consumer typecheck gaps: ${failures.join(", ")}`);
			process.exitCode = 1;
		} else if (process.exitCode !== 1) {
			console.log(`Checked ${selected.length} consumer TypeScript configs.`);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main();
}
