import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	createPolicy,
	findHighRiskAdditions,
	formatInventory,
	scanRepository,
} from "./lib/type-safety-audit.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(scriptDirectory, "fixtures", "type-safety-audit");

function isolatedFixture() {
	const root = mkdtempSync(join(tmpdir(), "type-safety-audit-"));
	const fixtureDirectory = join(
		root,
		".github/scripts/fixtures/type-safety-audit",
	);
	cpSync(fixtureRoot, fixtureDirectory, { recursive: true });
	for (const args of [["init"], ["add", "--all"]]) {
		const result = spawnSync("git", args, { cwd: root });
		assert.equal(result.status, 0);
	}
	return { fixtureDirectory, root };
}

test("scans TypeScript AST escape hatches and tsconfig posture deterministically", () => {
	const { fixtureDirectory, root } = isolatedFixture();
	try {
		const inventory = scanRepository(root);
		const categories = new Set(
			inventory.occurrences.map((entry) => entry.category),
		);

		for (const category of [
			"as-any-assertion",
			"assertion-function",
			"broad-as-assertion",
			"declaration-merging",
			"double-assertion",
			"explicit-any",
			"module-augmentation",
			"non-null-assertion",
			"ts-expect-error",
			"ts-ignore",
			"ts-nocheck",
			"tsconfig-exclude-posture",
			"tsconfig-files-posture",
			"tsconfig-implicit-any-posture",
			"tsconfig-include-posture",
			"tsconfig-references-posture",
			"tsconfig-skip-lib-check",
			"type-predicate",
			"unsafe-generic-default",
		]) {
			assert.ok(categories.has(category), `missing ${category}`);
		}

		assert.equal(
			inventory.occurrences.some((entry) => entry.path.includes("/generated/")),
			false,
		);
		assert.equal(
			inventory.occurrences.some((entry) => entry.path.includes("/vendor/")),
			false,
		);
		assert.deepEqual(
			inventory.occurrences.find(
				(entry) => entry.category === "tsconfig-implicit-any-posture",
			)?.value,
			{
				effectiveNoImplicitAny: false,
				explicitNoImplicitAny: null,
				strict: false,
			},
		);
		assert.equal(
			inventory.occurrences.filter(
				(entry) => entry.category === "double-assertion",
			).length,
			6,
		);
		assert.deepEqual(
			inventory.occurrences
				.filter(
					(entry) =>
						entry.category === "double-assertion" &&
						entry.path.endsWith("src/assertion-variants.ts"),
				)
				.map((entry) => entry.line),
			[4, 6, 7, 8, 9],
		);
		assert.equal(
			inventory.occurrences.filter((entry) => entry.category === "ts-ignore")
				.length,
			1,
		);
		assert.equal(
			inventory.occurrences.filter(
				(entry) => entry.category === "unsafe-generic-default",
			).length,
			1,
		);
		assert.equal(
			inventory.occurrences.find((entry) =>
				entry.path.endsWith("packages/example/test/helper.ts"),
			)?.scope,
			"test",
		);
		assert.equal(
			inventory.occurrences.filter(
				(entry) => entry.category === "declaration-merging",
			).length,
			4,
		);
		assert.equal(
			formatInventory(inventory),
			formatInventory(scanRepository(root)),
		);
		for (const directory of [".next", ".turbo", "dist"]) {
			const generatedConfig = join(root, directory, "tsconfig.generated.json");
			mkdirSync(dirname(generatedConfig), { recursive: true });
			writeFileSync(
				generatedConfig,
				'{"compilerOptions":{"skipLibCheck":true}}',
			);
		}
		assert.equal(
			formatInventory(inventory),
			formatInventory(scanRepository(root)),
		);
		writeFileSync(
			join(root, ".gitignore"),
			"demo/nextjs/next-env.d.ts\ndemo/stateless/next-env.d.ts\ndocs/next-env.d.ts\ndocs/.source/\n",
		);
		for (const path of [
			"demo/nextjs/next-env.d.ts",
			"demo/stateless/next-env.d.ts",
			"docs/next-env.d.ts",
			"docs/.source/browser.ts",
			"docs/.source/dynamic.ts",
			"docs/.source/server.ts",
		]) {
			const generatedPath = join(root, path);
			mkdirSync(dirname(generatedPath), { recursive: true });
			writeFileSync(generatedPath, "export {};\n");
		}
		assert.equal(
			formatInventory(inventory),
			formatInventory(scanRepository(root)),
		);
		writeFileSync(
			join(fixtureDirectory, ".gitignore"),
			"packages/example/generated/\n",
		);
		const generatedSource = join(
			fixtureDirectory,
			"packages/example/generated/new-source.ts",
		);
		mkdirSync(dirname(generatedSource), { recursive: true });
		writeFileSync(
			generatedSource,
			"declare const value: unknown; export const visible = value as any;\n",
		);
		assert.ok(
			scanRepository(root).occurrences.some(
				(entry) =>
					entry.path ===
						".github/scripts/fixtures/type-safety-audit/packages/example/generated/new-source.ts" &&
					entry.category === "as-any-assertion",
			),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("rejects a new production high-risk escape hatch with a stable content fingerprint", () => {
	const { root: temporaryRoot } = isolatedFixture();

	try {
		const baseline = createPolicy(scanRepository(temporaryRoot));
		assert.equal("summary" in baseline, false);
		const sourcePath = join(
			temporaryRoot,
			"packages/example/src/escape-hatches.ts",
		);
		mkdirSync(dirname(sourcePath), { recursive: true });
		writeFileSync(
			sourcePath,
			`declare const value: unknown;
// @ts-ignore newly added fixture suppression
// @ts-nocheck newly added fixture suppression
export const newAny = value as any;
export const newDouble = value as unknown as { id: string };
`,
		);

		const additions = findHighRiskAdditions(
			scanRepository(temporaryRoot),
			baseline,
		);
		assert.deepEqual(additions.map((entry) => entry.category).sort(), [
			"as-any-assertion",
			"double-assertion",
			"explicit-any",
			"ts-ignore",
			"ts-nocheck",
		]);
		for (const addition of additions) {
			assert.equal(
				addition.path,
				relative(temporaryRoot, sourcePath).replaceAll("\\", "/"),
			);
			assert.ok(addition.line > 0);
		}

		const anyAddition = additions.find(
			(entry) => entry.category === "as-any-assertion",
		);
		assert.ok(anyAddition);
		writeFileSync(
			sourcePath,
			`// unrelated leading comment\n${readFileSync(sourcePath, "utf8")}`,
		);
		const movedAddition = findHighRiskAdditions(
			scanRepository(temporaryRoot),
			baseline,
		).find((entry) => entry.category === "as-any-assertion");
		assert.ok(movedAddition);
		assert.equal(movedAddition.fingerprint, anyAddition.fingerprint);
	} finally {
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
});
