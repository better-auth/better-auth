import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	assertRootPackageReferences,
	parseJsonWithComments,
	semanticTypecheckRunner,
} from "./lib/typecheck-coverage.mjs";

test("reads TypeScript JSONC without corrupting strings or trailing commas", () => {
	const root = mkdtempSync(join(tmpdir(), "typecheck-coverage-"));
	const path = join(root, "tsconfig.json");
	try {
		writeFileSync(
			path,
			`{
				// URLs contain the same token as a line comment.
				"extends": "https://example.com/tsconfig.json",
				"compilerOptions": {
					/* JSONC permits block comments and trailing commas. */
					"strict": true,
				},
			}`,
		);
		assert.deepEqual(parseJsonWithComments(path), {
			extends: "https://example.com/tsconfig.json",
			compilerOptions: { strict: true },
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("derives semantic typecheck commands from the covered config", () => {
	const entry = {
		path: "e2e/example/tsconfig.json",
		verification: {
			kind: "semantic-typecheck",
			prepare: [{ label: "generate", command: ["exec", "generator"] }],
		},
	};
	assert.deepEqual(semanticTypecheckRunner(entry), {
		cwd: ".",
		command: [
			"exec",
			"tsc",
			"--noEmit",
			"--project",
			"e2e/example/tsconfig.json",
		],
		prepare: entry.verification.prepare,
	});
});

test("rejects a package source config omitted from the root graph", () => {
	assert.throws(
		() =>
			assertRootPackageReferences(
				["packages/core/tsconfig.json"],
				["packages/core/tsconfig.json", "packages/electron/tsconfig.json"],
			),
		/root tsconfig is missing package source references:\n  packages\/electron\/tsconfig\.json/,
	);
});
