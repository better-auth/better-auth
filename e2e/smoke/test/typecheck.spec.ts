import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

test("typecheck", () => {
	spawnSync("pnpm", ["run", "typecheck"], {
		stdio: "inherit",
		cwd: resolve(fixturesDir, "tsconfig-verbatim-module-syntax-node10"),
	});
});
