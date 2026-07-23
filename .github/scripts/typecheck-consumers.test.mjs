import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
	assertConsumerRunner,
	loadCoverageManifest,
} from "./lib/typecheck-coverage.mjs";
import {
	assertCandidateOrigins,
	candidateCommand,
} from "./typecheck-consumers.mjs";

function writePackage(root, name, types, source = "export {};\n") {
	mkdirSync(join(root, "dist"), { recursive: true });
	writeFileSync(
		join(root, "package.json"),
		`${JSON.stringify(
			{
				name,
				types,
				exports: { ".": { types } },
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(join(root, types), source);
}

function fixtureEntry() {
	return {
		path: "demo/nextjs/typecheck/dash/tsconfig.json",
		role: "contract-check",
		runner: {
			build: "candidate-build",
			candidatePackage: "@better-auth/infra",
			candidateWorkspacePackages: [
				"packages/better-auth",
				"packages/core",
				"packages/scim",
				"packages/sso",
			],
			candidateAllowedFamilyNodeModulesPackages: ["@better-auth/utils"],
			command: [
				"exec",
				"tsc",
				"--noEmit",
				"--project",
				"typecheck/dash/tsconfig.json",
			],
			cwd: "demo/nextjs",
		},
	};
}

function fixtureRoot() {
	const root = mkdtempSync(join(tmpdir(), "typecheck-consumers-"));
	mkdirSync(join(root, "demo/nextjs/typecheck/dash"), { recursive: true });
	writeFileSync(
		join(root, "demo/nextjs/typecheck/dash/tsconfig.json"),
		'{"compilerOptions":{}}\n',
	);
	writePackage(
		join(root, "packages/better-auth"),
		"better-auth",
		"dist/index.d.ts",
	);
	writePackage(
		join(root, "packages/core"),
		"@better-auth/core",
		"dist/index.d.ts",
	);
	writePackage(
		join(root, "packages/scim"),
		"@better-auth/scim",
		"dist/index.d.ts",
	);
	writePackage(
		join(root, "packages/sso"),
		"@better-auth/sso",
		"dist/index.d.ts",
	);
	writePackage(
		join(root, "infra"),
		"@better-auth/infra",
		"dist/index.d.ts",
		`import type {} from "better-auth";
import type {} from "@better-auth/core";
import type {} from "@better-auth/core/missing";
import type {} from "@better-auth/scim";
export {};\n`,
	);
	return root;
}

test("docs consumer regenerates Fumadocs source after Next type generation", () => {
	const manifest = loadCoverageManifest(process.cwd());
	const docs = manifest.consumers.find(
		(entry) => entry.path === "docs/tsconfig.json",
	);
	assert.ok(docs);
	assert.deepEqual(docs.runner.cleanPaths, [
		".next",
		".source",
		"tsconfig.tsbuildinfo",
	]);
	const commands = docs.runner.prepare.map((step) => step.command.join(" "));
	assert.deepEqual(commands, [
		"install --frozen-lockfile",
		"exec next typegen",
		"exec fumadocs-mdx",
	]);
});

test("candidate mappings fail closed when declaration targets are absent", () => {
	const root = fixtureRoot();
	const directories = [];
	try {
		const context = candidateCommand(
			root,
			fixtureEntry(),
			join(root, "infra"),
			directories,
		);
		const config = JSON.parse(readFileSync(context.configPath, "utf8"));
		assert.equal(
			config.compilerOptions.paths["@better-auth/infra"][0],
			context.candidate.rootTypePath,
		);

		writeFileSync(
			join(root, "infra/package.json"),
			JSON.stringify({
				name: "@better-auth/infra",
				types: "dist/missing.d.ts",
			}),
		);
		assert.throws(
			() =>
				candidateCommand(
					root,
					fixtureEntry(),
					join(root, "infra"),
					directories,
				),
			/types does not exist/,
		);

		writePackage(join(root, "infra"), "@better-auth/infra", "dist/index.d.ts");
		rmSync(join(root, "packages/core/dist/index.d.ts"));
		assert.throws(
			() =>
				candidateCommand(
					root,
					fixtureEntry(),
					join(root, "infra"),
					directories,
				),
			/@better-auth\/core package.json types does not exist/,
		);

		writePackage(
			join(root, "packages/core"),
			"@better-auth/core",
			"dist/index.d.ts",
		);
		writeFileSync(
			join(root, "infra/package.json"),
			`${JSON.stringify({
				name: "@better-auth/infra",
				types: "dist/index.d.ts",
				exports: { ".": { types: "dist/index.d.ts" } },
			})}\n`,
		);
		// A declaration symlink must not make a candidate package escape its root.
		rmSync(join(root, "infra/dist/index.d.ts"));
		writeFileSync(join(root, "outside.d.ts"), "export {};\n");
		// Use a relative symlink so the test covers canonical rather than lexical containment.
		symlinkSync("../../outside.d.ts", join(root, "infra/dist/index.d.ts"));
		assert.throws(
			() =>
				candidateCommand(
					root,
					fixtureEntry(),
					join(root, "infra"),
					directories,
				),
			/resolves outside its package directory/,
		);

		rmSync(join(root, "infra/dist/index.d.ts"));
		writeFileSync(join(root, "infra/dist/index.d.ts"), "export {};\n");
		mkdirSync(join(root, "infra/dist/generated"), { recursive: true });
		writeFileSync(
			join(root, "infra/package.json"),
			`${JSON.stringify({
				name: "@better-auth/infra",
				types: "dist/index.d.ts",
				exports: {
					".": { types: "dist/index.d.ts" },
					"./generated/*": { types: "dist/generated/*.d.ts" },
				},
			})}\n`,
		);
		assert.throws(
			() =>
				candidateCommand(
					root,
					fixtureEntry(),
					join(root, "infra"),
					directories,
				),
			/wildcard target matches no declaration files/,
		);

		writeFileSync(
			join(root, "infra/dist/generated/valid.d.ts"),
			"export {};\n",
		);
		symlinkSync(
			"../../../outside.d.ts",
			join(root, "infra/dist/generated/escaping.d.ts"),
		);
		assert.throws(
			() =>
				candidateCommand(
					root,
					fixtureEntry(),
					join(root, "infra"),
					directories,
				),
			/wildcard target tree may not contain symlinks/,
		);

		rmSync(join(root, "infra/dist/generated/escaping.d.ts"));
		mkdirSync(join(root, "outside-declarations"), { recursive: true });
		writeFileSync(
			join(root, "outside-declarations/nested.d.ts"),
			"export {};\n",
		);
		symlinkSync(
			"../../../outside-declarations",
			join(root, "infra/dist/generated/nested"),
		);
		assert.throws(
			() =>
				candidateCommand(
					root,
					fixtureEntry(),
					join(root, "infra"),
					directories,
				),
			/wildcard target tree may not contain symlinks/,
		);
	} finally {
		for (const directory of directories) {
			rmSync(directory, { recursive: true, force: true });
		}
		rmSync(root, { recursive: true, force: true });
	}
});

test("origin proof requires current mapped declarations and rejects node_modules fallback", () => {
	const root = fixtureRoot();
	const directories = [];
	try {
		const context = candidateCommand(
			root,
			fixtureEntry(),
			join(root, "infra"),
			directories,
		);
		const resolved = [
			context.candidate.rootTypePath,
			join(root, "packages/better-auth/dist/index.d.ts"),
			join(root, "packages/core/dist/index.d.ts"),
			join(root, "packages/scim/dist/index.d.ts"),
		].join("\n");
		assert.doesNotThrow(() =>
			assertCandidateOrigins(context.consumerRoot, context, resolved),
		);
		const allowedUtilityDeclaration = join(
			context.candidate.root,
			"node_modules/@better-auth/utils/dist/index.d.mts",
		);
		mkdirSync(dirname(allowedUtilityDeclaration), { recursive: true });
		writeFileSync(allowedUtilityDeclaration, "export {};\n");
		assert.doesNotThrow(() =>
			assertCandidateOrigins(
				context.consumerRoot,
				context,
				`${resolved}\n${allowedUtilityDeclaration}`,
			),
		);
		const canonicalCoreDeclaration = join(
			context.candidate.root,
			"node_modules/.bun/@better-auth-core@1.0.0/node_modules/@better-auth/core/canonical.d.mts",
		);
		mkdirSync(dirname(canonicalCoreDeclaration), { recursive: true });
		writeFileSync(canonicalCoreDeclaration, "export {};\n");
		const rawAllowedUtilityLink = join(
			context.candidate.root,
			"node_modules/@better-auth/utils/dist/linked-core.d.mts",
		);
		symlinkSync(canonicalCoreDeclaration, rawAllowedUtilityLink);
		assert.throws(
			() =>
				assertCandidateOrigins(
					context.consumerRoot,
					context,
					`${resolved}\n${rawAllowedUtilityLink}`,
				),
			/forbidden node_modules origin/,
		);

		const canonicalUtilityDeclaration = join(
			context.candidate.root,
			"node_modules/.bun/@better-auth-utils@1.0.0/node_modules/@better-auth/utils/canonical.d.mts",
		);
		mkdirSync(dirname(canonicalUtilityDeclaration), { recursive: true });
		writeFileSync(canonicalUtilityDeclaration, "export {};\n");
		const rawDisallowedCoreLink = join(
			context.candidate.root,
			"node_modules/@better-auth/core/dist/linked-utils.d.mts",
		);
		mkdirSync(dirname(rawDisallowedCoreLink), { recursive: true });
		symlinkSync(canonicalUtilityDeclaration, rawDisallowedCoreLink);
		assert.throws(
			() =>
				assertCandidateOrigins(
					context.consumerRoot,
					context,
					`${resolved}\n${rawDisallowedCoreLink}`,
				),
			/forbidden node_modules origin/,
		);

		const staleStoreDeclaration = join(
			context.candidate.root,
			"node_modules/.bun/@better-auth-core@1.0.0/node_modules/@better-auth/core/missing.d.mts",
		);
		mkdirSync(dirname(staleStoreDeclaration), { recursive: true });
		writeFileSync(staleStoreDeclaration, "export {};\n");
		const fallback = join(context.candidate.root, "resolved-stale-core.d.mts");
		symlinkSync(staleStoreDeclaration, fallback);
		assert.throws(
			() =>
				assertCandidateOrigins(
					context.consumerRoot,
					context,
					`${resolved}\n${fallback}`,
				),
			/forbidden node_modules origin/,
		);

		const nestedDisallowedDeclaration = join(
			context.candidate.root,
			"node_modules/@better-auth/utils/node_modules/@better-auth/core/missing.d.mts",
		);
		mkdirSync(dirname(nestedDisallowedDeclaration), { recursive: true });
		writeFileSync(nestedDisallowedDeclaration, "export {};\n");
		assert.throws(
			() =>
				assertCandidateOrigins(
					context.consumerRoot,
					context,
					`${resolved}\n${nestedDisallowedDeclaration}`,
				),
			/forbidden node_modules origin/,
		);
	} finally {
		for (const directory of directories) {
			rmSync(directory, { recursive: true, force: true });
		}
		rmSync(root, { recursive: true, force: true });
	}
});

test("contract-check manifests cannot omit the candidate mapping declaration", () => {
	const root = fixtureRoot();
	try {
		const entry = fixtureEntry();
		entry.runner.candidatePackage = undefined;
		assert.throws(
			() => assertConsumerRunner(root, entry, new Set(["candidate-build"])),
			/require runner.candidatePackage/,
		);

		const candidateOverlap = fixtureEntry();
		candidateOverlap.runner.candidateAllowedFamilyNodeModulesPackages = [
			"@better-auth/infra",
		];
		assert.throws(
			() =>
				assertConsumerRunner(
					root,
					candidateOverlap,
					new Set(["candidate-build"]),
				),
			/may not allow candidate or workspace package @better-auth\/infra/,
		);

		const workspaceOverlap = fixtureEntry();
		workspaceOverlap.runner.candidateAllowedFamilyNodeModulesPackages = [
			"@better-auth/core",
		];
		assert.throws(
			() =>
				assertConsumerRunner(
					root,
					workspaceOverlap,
					new Set(["candidate-build"]),
				),
			/may not allow candidate or workspace package @better-auth\/core/,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
