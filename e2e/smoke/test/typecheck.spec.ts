import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));
[
	"tsconfig-declaration",
	"tsconfig-exact-optional-property-types",
	"tsconfig-verbatim-module-syntax-node10",
	"tsconfig-isolated-module-bundler",
].forEach((dir) => {
	test(`typecheck ${dir}`, () => {
		spawnSync("pnpm", ["run", "typecheck"], {
			stdio: "inherit",
			cwd: resolve(fixturesDir, dir),
		});
	});
});
