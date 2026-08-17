import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export type DrizzleKitDialect = "mysql" | "postgresql" | "sqlite";

/**
 * Finds the `drizzle-kit` CLI that the workspace already installs.
 *
 * `drizzle-kit` is a devDependency of the parent `e2e/adapter` workspace. When
 * the tests started it as `npx drizzle-kit`, npx looked in the parent
 * directories and found the package again at each start. A full adapter run
 * makes 407 starts. This function does the search one time.
 *
 * This cannot use `require.resolve("drizzle-kit/package.json")`, which is the
 * method that `push-prisma-schema.ts` uses for Prisma. The `exports` map of
 * drizzle-kit supplies only `.` and `./api`, so a deep specifier gives the
 * error ERR_PACKAGE_PATH_NOT_EXPORTED. This function resolves the main entry
 * and uses the `bin` file beside it.
 */
function resolveDrizzleKitCli() {
	const require = createRequire(import.meta.url);
	return join(dirname(require.resolve("drizzle-kit")), "bin.cjs");
}

const drizzleKitCli = resolveDrizzleKitCli();

/**
 * Runs `drizzle-kit push` for a generated schema.
 *
 * The arguments go to the CLI as an array, not as one shell string. Thus no
 * shell starts, and schema paths and connection URLs do not need quotation
 * marks.
 */
export async function pushDrizzleSchema(
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
	execFileSync(process.execPath, [drizzleKitCli, ...args], {
		cwd: import.meta.dirname,
		stdio: "inherit",
	});
}
