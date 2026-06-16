import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vitest globalSetup that builds the browser UI runtime before tests run.
 *
 * `src/ui/runtime.generated.ts` is a gitignored build artifact (produced from
 * `src/ui/runtime/**` by `scripts/build-runtime.mjs`). Tests import the auth UI
 * router from source, which reads that generated string, so it must exist
 * before any test module is evaluated.
 */
export default function setup() {
	const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
	execFileSync("node", ["scripts/build-runtime.mjs"], {
		stdio: "inherit",
		cwd: pkgRoot,
	});
}
