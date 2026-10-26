import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export type DrizzleKitDialect = "mysql" | "postgresql" | "sqlite";

const drizzleKitCliPaths = new Map<string, string>();

/**
 * Finds the `drizzle-kit` CLI that is installed for a test directory, one time
 * per directory.
 *
 * Each test package can pin its own `drizzle-kit` version, so the CLI is
 * resolved from the directory of the caller and not from this file.
 *
 * This cannot use `require.resolve("drizzle-kit/package.json")`. The `exports`
 * map of drizzle-kit does not include it, so a deep specifier gives the error
 * ERR_PACKAGE_PATH_NOT_EXPORTED. This function resolves the main entry and
 * uses the `bin` file beside it.
 */
function resolveDrizzleKitCli(cwd: string) {
	let cli = drizzleKitCliPaths.get(cwd);
	if (!cli) {
		const require = createRequire(join(cwd, "noop.js"));
		cli = join(dirname(require.resolve("drizzle-kit")), "bin.cjs");
		drizzleKitCliPaths.set(cwd, cli);
	}
	return cli;
}

/**
 * Runs `drizzle-kit push` for a generated schema.
 *
 * The CLI runs with the current Node.js binary and the arguments go to it as
 * an array, so no shell or package runner starts for each push.
 *
 * @param cwd - The test directory. The schema path is relative to it, and the
 * `drizzle-kit` version installed for it is used.
 */
export async function pushDrizzleSchema(
	cwd: string,
	dialect: DrizzleKitDialect,
	schema: string,
	url: string,
) {
	const args = [
		"push",
		`--dialect=${dialect}`,
		`--schema=${schema}`,
		`--url=${url}`,
	];
	console.log(`Running: drizzle-kit ${args.join(" ")}`);
	// wait for the above console.log to be printed
	await new Promise((resolve) => setTimeout(resolve, 10));
	execFileSync(process.execPath, [resolveDrizzleKitCli(cwd), ...args], {
		cwd,
		stdio: "inherit",
	});
}
