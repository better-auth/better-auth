import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

// TODO: some tests are not working as expected
[
	{ dir: "tsconfig-declaration", todo: false },
	{ dir: "tsconfig-exact-optional-property-types", todo: true },
	{ dir: "tsconfig-verbatim-module-syntax-node10", todo: true },
	{ dir: "tsconfig-isolated-module-bundler", todo: false },
].forEach(({ dir, todo }) => {
	test(`typecheck ${dir}`, { todo }, () => {
		const cwd = resolve(fixturesDir, dir);
		const output = spawnSync("pnpm", ["run", "typecheck"], {
			stdio: "inherit",
			cwd,
			timeout: 10 * 1000, // 10 seconds
		});
		assert.equal(
			output.error,
			undefined,
			`Running typecheck in ${cwd} should not throw an error`,
		);
		assert.equal(
			output.status,
			0,
			`Running typecheck in ${cwd} should exit with status 0`,
		);
	});
});
