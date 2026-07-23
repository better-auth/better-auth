import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const sourceExtensions = new Set([".cts", ".mts", ".ts", ".tsx"]);

export const scanRules = {
	excludedSourceRoots: [
		".github/scripts/fixtures/type-safety-audit/generated",
		".github/scripts/fixtures/type-safety-audit/vendor",
		"demo/electron/build",
		"demo/nextjs/next-env.d.ts",
		"demo/nextjs/.next",
		"demo/stateless/next-env.d.ts",
		"demo/stateless/.next",
		"docs/next-env.d.ts",
		"docs/.source/browser.ts",
		"docs/.source/dynamic.ts",
		"docs/.source/server.ts",
		"docs/.next",
		"packages/api-key/dist",
		"packages/better-auth/dist",
		"packages/cimd/dist",
		"packages/cli/dist",
		"packages/core/dist",
		"packages/drizzle-adapter/dist",
		"packages/electron/dist",
		"packages/expo/dist",
		"packages/i18n/dist",
		"packages/kysely-adapter/dist",
		"packages/mcp/dist",
		"packages/memory-adapter/dist",
		"packages/mongo-adapter/dist",
		"packages/oauth-provider/dist",
		"packages/passkey/dist",
		"packages/prisma-adapter/dist",
		"packages/redis-storage/dist",
		"packages/scim/dist",
		"packages/sso/dist",
		"packages/stripe/dist",
		"packages/telemetry/dist",
		"packages/test-utils/dist",
	],
	sourceInventory: "git-tracked-untracked-and-ignored-non-vendor-source",
	sourceExtensions: [...sourceExtensions].sort(),
};

const highRiskCategories = new Set([
	"as-any-assertion",
	"double-assertion",
	"explicit-any",
	"ts-ignore",
	"ts-nocheck",
]);

function relativePath(root, path) {
	return relative(root, path).replaceAll("\\", "/");
}

function getScriptKind(path) {
	switch (extname(path)) {
		case ".tsx":
			return ts.ScriptKind.TSX;
		case ".cts":
			return ts.ScriptKind.CTS;
		case ".mts":
			return ts.ScriptKind.MTS;
		default:
			return ts.ScriptKind.TS;
	}
}

function normalizeText(value) {
	return value.replace(/\s+/g, " ").trim();
}

function occurrenceAnchor(node, sourceFile) {
	for (let current = node.parent; current; current = current.parent) {
		if (
			ts.isVariableDeclaration(current) ||
			ts.isParameter(current) ||
			ts.isPropertyDeclaration(current) ||
			ts.isPropertySignature(current) ||
			ts.isFunctionDeclaration(current) ||
			ts.isMethodDeclaration(current) ||
			ts.isTypeAliasDeclaration(current) ||
			ts.isInterfaceDeclaration(current)
		) {
			return `${current.kind}:${current.getText(sourceFile)}`;
		}
	}
	return `${node.parent?.kind ?? "source"}:${node.parent?.getText(sourceFile) ?? ""}`;
}

function fingerprint(category, scope, path, text, anchor = "") {
	return createHash("sha256")
		.update(
			`${category}\0${scope}\0${path}\0${normalizeText(text)}\0${normalizeText(anchor)}`,
		)
		.digest("hex")
		.slice(0, 20);
}

function classifyScope(path, isConfig = false) {
	if (isConfig) return "config";
	if (path.startsWith("demo/")) return "demo";
	if (
		path.startsWith("e2e/") ||
		path.startsWith("test/") ||
		path.includes("/test/") ||
		path.includes("/tests/") ||
		path.includes("/__tests__/") ||
		/(^|\/)[^/]+\.(spec|test)\.[cm]?tsx?$/.test(path) ||
		path.includes("/fixtures/")
	) {
		return "test";
	}
	return "production";
}

function classifyRisk(category, scope) {
	if (scope !== "production") return "contextual";
	if (highRiskCategories.has(category)) return "high";
	if (
		[
			"broad-as-assertion",
			"non-null-assertion",
			"ts-expect-error",
			"unsafe-generic-default",
		].includes(category)
	) {
		return "medium";
	}
	if (category === "tsconfig-skip-lib-check") return "medium";
	return "reviewed-pattern";
}

function classifyIntent(category) {
	const intents = {
		"as-any-assertion": "unchecked assertion",
		"assertion-function": "runtime narrowing contract",
		"broad-as-assertion": "type narrowing or coercion",
		"declaration-merging": "declaration merge candidate",
		"double-assertion": "type-system escape hatch",
		"explicit-any": "unconstrained type",
		"module-augmentation": "external declaration extension",
		"non-null-assertion": "nullability bypass",
		"ts-expect-error": "expected compiler diagnostic suppression",
		"ts-ignore": "compiler diagnostic suppression",
		"ts-nocheck": "whole-file compiler diagnostic suppression",
		"tsconfig-exclude-posture": "compiler file exclusion posture",
		"tsconfig-files-posture": "explicit compiler file posture",
		"tsconfig-implicit-any-posture": "implicit any compiler diagnostic posture",
		"tsconfig-include-posture": "compiler file inclusion posture",
		"tsconfig-references-posture": "project reference posture",
		"tsconfig-skip-lib-check": "declaration checking posture",
		"type-predicate": "runtime narrowing contract",
		"unsafe-generic-default": "unconstrained generic fallback",
	};
	return intents[category] ?? "review required";
}

function sourcePosition(sourceFile, position) {
	const { line, character } =
		sourceFile.getLineAndCharacterOfPosition(position);
	return { line: line + 1, column: character + 1 };
}

function addOccurrence(occurrences, sourceFile, path, scope, category, node) {
	const position = sourcePosition(sourceFile, node.getStart(sourceFile));
	const text = node.getText(sourceFile);
	occurrences.push({
		category,
		column: position.column,
		fingerprint: fingerprint(
			category,
			scope,
			path,
			text,
			occurrenceAnchor(node, sourceFile),
		),
		intent: classifyIntent(category),
		line: position.line,
		path,
		risk: classifyRisk(category, scope),
		scope,
	});
}

function isAnyType(node) {
	return node.kind === ts.SyntaxKind.AnyKeyword;
}

function isUnsafeGenericDefault(node) {
	return isAnyType(node);
}

function isAssertionExpression(node) {
	return ts.isAsExpression(node) || ts.isTypeAssertionExpression(node);
}

function assertionType(node) {
	return node.type;
}

function unwrapTransparentAssertionWrappers(node) {
	let current = node;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isNonNullExpression(current)
	) {
		current = current.expression;
	}
	return current;
}

function isDoubleAssertion(node) {
	const inner = unwrapTransparentAssertionWrappers(node.expression);
	return (
		isAssertionExpression(node) &&
		isAssertionExpression(inner) &&
		[
			ts.SyntaxKind.AnyKeyword,
			ts.SyntaxKind.NeverKeyword,
			ts.SyntaxKind.UnknownKeyword,
		].includes(assertionType(inner).kind)
	);
}

function isConstAssertion(node) {
	return assertionType(node).kind === ts.SyntaxKind.ConstType;
}

function addDirectiveOccurrences(occurrences, sourceFile, path, scope) {
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		getScriptKind(path),
		sourceFile.text,
	);

	for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; ) {
		if (
			token === ts.SyntaxKind.SingleLineCommentTrivia ||
			token === ts.SyntaxKind.MultiLineCommentTrivia
		) {
			const text = scanner.getTokenText();
			const category = /^\s*(?:\/\/|\/\*)\s*@ts-nocheck\b/.test(text)
				? "ts-nocheck"
				: /^\s*(?:\/\/|\/\*)\s*@ts-ignore\b/.test(text)
					? "ts-ignore"
					: /^\s*(?:\/\/|\/\*)\s*@ts-expect-error\b/.test(text)
						? "ts-expect-error"
						: undefined;
			if (category) {
				const position = sourcePosition(sourceFile, scanner.getTokenPos());
				occurrences.push({
					category,
					column: position.column,
					fingerprint: fingerprint(category, scope, path, text, text),
					intent: classifyIntent(category),
					line: position.line,
					path,
					risk: classifyRisk(category, scope),
					scope,
				});
			}
		}
		token = scanner.scan();
	}
}

function declarationScope(sourceFile, node) {
	const names = [];
	for (let current = node.parent; current; current = current.parent) {
		if (ts.isModuleDeclaration(current)) {
			names.push(current.name.getText(sourceFile));
		}
	}
	const base = ts.isExternalModule(sourceFile) ? sourceFile.fileName : "global";
	return `${base}:${names.reverse().join(".")}`;
}

function scanSourceFile(root, absolutePath) {
	const path = relativePath(root, absolutePath);
	const scope = classifyScope(path);
	const sourceFile = ts.createSourceFile(
		path,
		readFileSync(absolutePath, "utf8"),
		ts.ScriptTarget.Latest,
		true,
		getScriptKind(path),
	);
	const occurrences = [];
	addDirectiveOccurrences(occurrences, sourceFile, path, scope);

	function visit(node) {
		if (isAssertionExpression(node)) {
			if (isDoubleAssertion(node)) {
				addOccurrence(
					occurrences,
					sourceFile,
					path,
					scope,
					"double-assertion",
					node,
				);
			} else if (isAnyType(assertionType(node))) {
				addOccurrence(
					occurrences,
					sourceFile,
					path,
					scope,
					"as-any-assertion",
					node,
				);
			} else if (!isConstAssertion(node)) {
				addOccurrence(
					occurrences,
					sourceFile,
					path,
					scope,
					"broad-as-assertion",
					node,
				);
			}
		}

		if (node.kind === ts.SyntaxKind.AnyKeyword) {
			addOccurrence(occurrences, sourceFile, path, scope, "explicit-any", node);
		}

		if (ts.isNonNullExpression(node)) {
			addOccurrence(
				occurrences,
				sourceFile,
				path,
				scope,
				"non-null-assertion",
				node,
			);
		}

		if (ts.isTypeParameterDeclaration(node) && node.default) {
			if (isUnsafeGenericDefault(node.default)) {
				addOccurrence(
					occurrences,
					sourceFile,
					path,
					scope,
					"unsafe-generic-default",
					node,
				);
			}
		}

		if (ts.isTypePredicateNode(node)) {
			addOccurrence(
				occurrences,
				sourceFile,
				path,
				scope,
				"type-predicate",
				node,
			);
			if (node.assertsModifier) {
				addOccurrence(
					occurrences,
					sourceFile,
					path,
					scope,
					"assertion-function",
					node,
				);
			}
		}

		if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
			addOccurrence(
				occurrences,
				sourceFile,
				path,
				scope,
				"module-augmentation",
				node,
			);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	return occurrences;
}

function declarationMergeOccurrences(root, absolutePaths) {
	const candidates = new Map();
	for (const absolutePath of absolutePaths) {
		const path = relativePath(root, absolutePath);
		const sourceFile = ts.createSourceFile(
			path,
			readFileSync(absolutePath, "utf8"),
			ts.ScriptTarget.Latest,
			true,
			getScriptKind(path),
		);
		const scope = classifyScope(path);
		function visit(node) {
			if (
				ts.isInterfaceDeclaration(node) ||
				ts.isClassDeclaration(node) ||
				ts.isModuleDeclaration(node)
			) {
				const name = node.name?.getText(sourceFile);
				if (name) {
					const key = `${declarationScope(sourceFile, node)}:${name}`;
					const declarations = candidates.get(key) ?? [];
					declarations.push({ node, path, scope, sourceFile });
					candidates.set(key, declarations);
				}
			}
			ts.forEachChild(node, visit);
		}
		visit(sourceFile);
	}

	const occurrences = [];
	for (const declarations of candidates.values()) {
		if (declarations.length > 1) {
			for (const declaration of declarations) {
				addOccurrence(
					occurrences,
					declaration.sourceFile,
					declaration.path,
					declaration.scope,
					"declaration-merging",
					declaration.node,
				);
			}
		}
	}
	return occurrences;
}

function gitFileList(root, args) {
	const result = spawnSync("git", ["ls-files", "-z", ...args], {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) return undefined;
	return result.stdout.split("\0").filter(Boolean);
}

function isExcludedSourcePath(path) {
	return scanRules.excludedSourceRoots.find(
		(root) => path === root || path.startsWith(`${root}/`),
	);
}

function listRepositoryFiles(root) {
	const tracked = gitFileList(root, []);
	const untracked = gitFileList(root, ["--others", "--exclude-standard"]);
	const ignored = gitFileList(root, [
		"--others",
		"--ignored",
		"--exclude-standard",
	]);
	if (!tracked || !untracked || !ignored) {
		throw new Error(
			"Type safety source inventory requires a Git worktree with tracked, untracked, and ignored file visibility",
		);
	}

	const files = [];
	const excluded = new Map(
		scanRules.excludedSourceRoots.map((path) => [
			path,
			{
				path,
				rule: "audited-source-root",
				scope: "generated",
			},
		]),
	);
	for (const path of new Set([...tracked, ...untracked, ...ignored])) {
		if (!sourceExtensions.has(extname(path))) continue;
		if (path.split("/").includes("node_modules") || path.startsWith(".git/")) {
			continue;
		}
		const excludedRoot = isExcludedSourcePath(path);
		if (excludedRoot) {
			continue;
		}
		const absolutePath = join(root, path);
		if (existsSync(absolutePath)) files.push(absolutePath);
	}

	return {
		excluded: [...excluded.values()].sort((left, right) =>
			left.path.localeCompare(right.path),
		),
		files: files.sort((left, right) => left.localeCompare(right)),
	};
}

function listTsconfigFiles(root) {
	const files = [];
	const directories = [root];

	while (directories.length) {
		const directory = directories.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const absolutePath = join(directory, entry.name);
			if (
				entry.isDirectory() &&
				(entry.name === ".git" || entry.name === "node_modules")
			) {
				continue;
			}
			if (entry.isDirectory()) {
				directories.push(absolutePath);
			} else if (
				entry.isFile() &&
				entry.name.startsWith("tsconfig") &&
				entry.name.endsWith(".json")
			) {
				files.push(absolutePath);
			}
		}
	}

	return files.sort((left, right) => left.localeCompare(right));
}

function scanTsconfig(root, absolutePath) {
	const path = relativePath(root, absolutePath);
	const result = ts.readConfigFile(absolutePath, ts.sys.readFile);
	if (result.error) {
		throw new Error(
			ts.flattenDiagnosticMessageText(result.error.messageText, "\n"),
		);
	}
	const parsed = ts.parseJsonConfigFileContent(
		result.config,
		ts.sys,
		dirname(absolutePath),
		undefined,
		absolutePath,
	);
	if (parsed.errors.length) {
		throw new Error(
			parsed.errors
				.map((error) =>
					ts.flattenDiagnosticMessageText(error.messageText, "\n"),
				)
				.join("\n"),
		);
	}

	const scope = classifyScope(path, true);
	const raw = result.config;
	const position = { line: 1, column: 1 };
	const effectiveNoImplicitAny =
		parsed.options.noImplicitAny ?? parsed.options.strict === true;
	const entries = [
		{
			category: "tsconfig-skip-lib-check",
			value: parsed.options.skipLibCheck === true,
		},
		{
			category: "tsconfig-implicit-any-posture",
			value: {
				effectiveNoImplicitAny,
				explicitNoImplicitAny: parsed.options.noImplicitAny ?? null,
				strict: parsed.options.strict ?? false,
			},
		},
		{
			category: "tsconfig-include-posture",
			value: raw.include ?? "TypeScript default include",
		},
		{
			category: "tsconfig-files-posture",
			value: raw.files ?? "No explicit files list",
		},
		{
			category: "tsconfig-exclude-posture",
			value: raw.exclude ?? "TypeScript default exclude",
		},
		{
			category: "tsconfig-references-posture",
			value: raw.references ?? "No project references",
		},
	];

	return entries.map((entry) => ({
		category: entry.category,
		column: position.column,
		fingerprint: fingerprint(
			entry.category,
			scope,
			path,
			JSON.stringify(entry.value),
		),
		intent: classifyIntent(entry.category),
		line: position.line,
		path,
		risk:
			entry.category === "tsconfig-skip-lib-check" && entry.value === true
				? "medium"
				: entry.category === "tsconfig-implicit-any-posture" &&
						entry.value.effectiveNoImplicitAny !== true
					? "medium"
					: "reviewed-pattern",
		scope,
		value: entry.value,
	}));
}

function sortOccurrences(occurrences) {
	return occurrences.sort(
		(left, right) =>
			left.path.localeCompare(right.path) ||
			left.line - right.line ||
			left.column - right.column ||
			left.category.localeCompare(right.category) ||
			left.fingerprint.localeCompare(right.fingerprint),
	);
}

function summarize(occurrences) {
	const counts = new Map();
	for (const occurrence of occurrences) {
		const key = `${occurrence.scope}:${occurrence.category}:${occurrence.risk}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts]
		.map(([key, count]) => {
			const [scope, category, risk] = key.split(":");
			return { category, count, risk, scope };
		})
		.sort(
			(left, right) =>
				left.scope.localeCompare(right.scope) ||
				left.category.localeCompare(right.category) ||
				left.risk.localeCompare(right.risk),
		);
}

export function scanRepository(root) {
	const absoluteRoot = resolve(root);
	const sourceInventory = listRepositoryFiles(absoluteRoot);
	const occurrences = sourceInventory.files.flatMap((path) =>
		scanSourceFile(absoluteRoot, path),
	);
	occurrences.push(
		...declarationMergeOccurrences(absoluteRoot, sourceInventory.files),
	);
	const tsconfigFiles = listTsconfigFiles(absoluteRoot);
	for (const path of tsconfigFiles) {
		occurrences.push(...scanTsconfig(absoluteRoot, path));
	}

	return {
		excluded: sourceInventory.excluded,
		occurrences: sortOccurrences(occurrences),
		scanRules,
		sourceFileCount: sourceInventory.files.length,
		summary: summarize(occurrences),
		tsconfigCount: tsconfigFiles.length,
	};
}

export function createPolicy(inventory) {
	const grouped = new Map();
	for (const occurrence of inventory.occurrences) {
		if (occurrence.scope !== "production" || occurrence.risk !== "high") {
			continue;
		}
		const key = `${occurrence.category}:${occurrence.fingerprint}`;
		const entry = grouped.get(key) ?? {
			category: occurrence.category,
			count: 0,
			fingerprint: occurrence.fingerprint,
		};
		entry.count += 1;
		grouped.set(key, entry);
	}

	return {
		policyVersion: 1,
		scanRules,
		summary: inventory.summary,
		highRiskProduction: [...grouped.values()].sort(
			(left, right) =>
				left.category.localeCompare(right.category) ||
				left.fingerprint.localeCompare(right.fingerprint),
		),
	};
}

export function findHighRiskAdditions(inventory, policy) {
	const baseline = new Map(
		policy.highRiskProduction.map((entry) => [
			`${entry.category}:${entry.fingerprint}`,
			entry.count,
		]),
	);
	const additions = [];
	for (const occurrence of inventory.occurrences) {
		if (occurrence.scope !== "production" || occurrence.risk !== "high") {
			continue;
		}
		const key = `${occurrence.category}:${occurrence.fingerprint}`;
		const remaining = baseline.get(key) ?? 0;
		if (remaining > 0) {
			baseline.set(key, remaining - 1);
		} else {
			additions.push(occurrence);
		}
	}
	return sortOccurrences(additions);
}

export function validatePolicy(policy, label = "policy") {
	if (
		policy.policyVersion !== 1 ||
		!Array.isArray(policy.highRiskProduction) ||
		JSON.stringify(policy.scanRules) !== JSON.stringify(scanRules)
	) {
		throw new Error(`${label} does not match the supported audit policy`);
	}
	return policy;
}

export function loadPolicy(
	root,
	policyPath = ".github/type-safety-policy.json",
) {
	const absolutePath = join(root, policyPath);
	if (!existsSync(absolutePath)) {
		throw new Error(`Missing ${policyPath}`);
	}
	return validatePolicy(
		JSON.parse(readFileSync(absolutePath, "utf8")),
		policyPath,
	);
}

export function formatInventory(inventory) {
	const lines = [
		`Type safety inventory: ${inventory.sourceFileCount} source files, ${inventory.tsconfigCount} tsconfig files, ${inventory.occurrences.length} occurrences.`,
		"Implicit any is reported as effective compiler posture; semantic implicit-any diagnostics remain owned by tsc.",
		"Audited excluded generated paths:",
		...inventory.excluded.map(
			(entry) => `  ${entry.path} scope=${entry.scope} rule=${entry.rule}`,
		),
		"Classification summary:",
		...inventory.summary.map(
			(entry) =>
				`  ${entry.scope} ${entry.risk} ${entry.category}: ${entry.count}`,
		),
		"Occurrences:",
		...inventory.occurrences.map((entry) => {
			const value =
				entry.value === undefined
					? ""
					: ` value=${JSON.stringify(entry.value)}`;
			return `  ${entry.path}:${entry.line}:${entry.column} ${entry.scope} ${entry.risk} ${entry.category} intent=${JSON.stringify(entry.intent)} fingerprint=${entry.fingerprint}${value}`;
		}),
	];
	return `${lines.join("\n")}\n`;
}
