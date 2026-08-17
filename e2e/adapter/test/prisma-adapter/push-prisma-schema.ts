import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createConnection } from "mysql2/promise";
import type { Dialect } from "./constants";
import { DATABASE_URLS } from "./constants";

// Cache previously generated client directories per schema content,
// so we can copy instead of running `prisma generate` again.
const lastGeneratedDir = new Map<string, string>();

// The schema that is currently in each database. When the next push carries
// the same schema, the tables are already correct and only the data must go.
const activeSchemaKey = new Map<Dialect, string>();

/**
 * Empties every table in the MySQL test database, without a schema rebuild.
 *
 * `SET FOREIGN_KEY_CHECKS` applies to one session. This function therefore
 * opens a single dedicated connection and not a pool. On a pool the statement
 * that disables the checks and the TRUNCATE statements can go to different
 * sessions, and then the TRUNCATE statements fail against the foreign keys.
 *
 * TRUNCATE keeps the table structure and resets AUTO_INCREMENT, so the result
 * is the same as a rebuild when the schema did not change.
 *
 * Returns false if the database has no tables. The caller then does the full
 * push instead.
 */
async function resetMysqlData(): Promise<boolean> {
	const connection = await createConnection(DATABASE_URLS.mysql);
	try {
		const [rows] = await connection.query(
			"SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
		);
		const tables = (rows as { name: string }[]).map((row) => row.name);
		if (tables.length === 0) return false;

		await connection.query("SET FOREIGN_KEY_CHECKS = 0");
		try {
			for (const table of tables) {
				await connection.query(
					`TRUNCATE TABLE \`${table.replaceAll("`", "``")}\``,
				);
			}
		} finally {
			await connection.query("SET FOREIGN_KEY_CHECKS = 1");
		}
		return true;
	} finally {
		await connection.end();
	}
}

function resolvePrismaCli() {
	const require = createRequire(import.meta.url);
	return join(
		dirname(require.resolve("prisma/package.json")),
		"build",
		"index.js",
	);
}

export async function pushPrismaSchema(dialect: Dialect) {
	const cwd = import.meta.dirname;
	const cli = `${process.execPath} ${resolvePrismaCli()}`;

	// Write a per-dialect prisma config file (Prisma v7 requires datasource url here)
	const configPath = join(cwd, `prisma-config-${dialect}.ts`);
	fs.writeFileSync(
		configPath,
		`import { defineConfig } from "prisma/config";
export default defineConfig({
	schema: "./schema-${dialect}.prisma",
	datasource: { url: "${DATABASE_URLS[dialect]}" },
});
`,
		"utf-8",
	);

	const schemaPath = join(cwd, `schema-${dialect}.prisma`);
	const schemaContent = fs.readFileSync(schemaPath, "utf-8");
	// Strip the output path (changes each iteration) for cache key comparison
	const schemaKey = schemaContent.replace(/\s*output\s*=\s*"[^"]*"\n?/, "");

	const outputMatch = schemaContent.match(/output\s*=\s*"([^"]*)"/);
	const outputDir = outputMatch ? join(cwd, outputMatch[1]) : null;

	try {
		// The schema in the database is already the one we are about to push, so
		// empty the tables instead of a rebuild through a child process.
		const reused =
			dialect === "mysql" &&
			activeSchemaKey.get(dialect) === schemaKey &&
			(await resetMysqlData());

		if (!reused) {
			execSync(
				`${cli} db push --force-reset --accept-data-loss --config ${configPath}`,
				{
					stdio: "pipe",
					cwd,
					env: {
						...process.env,
						// Prisma v7 blocks --force-reset when it detects an AI agent; this env var grants consent.
						PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
							"I am running tests in a local development environment",
					},
				},
			);
			activeSchemaKey.set(dialect, schemaKey);
		}

		if (outputDir) {
			const prevDir = lastGeneratedDir.get(schemaKey);
			if (prevDir && fs.existsSync(prevDir)) {
				fs.cpSync(prevDir, outputDir, { recursive: true });
			} else {
				execSync(`${cli} generate --config ${configPath}`, {
					stdio: "pipe",
					cwd,
				});
				lastGeneratedDir.set(schemaKey, outputDir);
			}
		}
	} catch (error) {
		const err = error as { stdout?: Buffer; stderr?: Buffer };
		console.error(
			`[pushPrismaSchema] failed for ${dialect}:`,
			err.stdout?.toString() || "",
			err.stderr?.toString() || "",
		);
		throw error;
	} finally {
		fs.unlinkSync(configPath);
	}
}
