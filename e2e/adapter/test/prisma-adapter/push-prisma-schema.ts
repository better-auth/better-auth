import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Dialect } from "./constants";
import { DATABASE_URLS } from "./constants";

// Cache previously generated client directories per schema content,
// so we can copy instead of running `prisma generate` again.
const lastGeneratedDir = new Map<string, string>();

// Track the schema last pushed per dialect. Migrations run on every
// better-auth options change, but most of them produce a schema that is
// already in the database. Then a full `prisma db push --force-reset` (a CLI
// subprocess that drops and recreates every table) is not needed, and clearing
// the data in-process is enough for test isolation.
const lastPushedSchema = new Map<string, string>();

// The raw query methods used for the data reset. Prisma omits `$transaction`
// from the client passed to a transaction callback.
type RawQueryClient = {
	$queryRawUnsafe: <T = unknown>(
		query: string,
		...values: unknown[]
	) => Promise<T>;
	$executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
};

type RawClient = RawQueryClient & {
	$transaction: <T>(fn: (tx: RawQueryClient) => Promise<T>) => Promise<T>;
};

function resolvePrismaCli() {
	const require = createRequire(import.meta.url);
	return join(
		dirname(require.resolve("prisma/package.json")),
		"build",
		"index.js",
	);
}

// Empties every table and resets its identity counter, which leaves the same
// state as `db push --force-reset` when the schema is unchanged. Throws on any
// failure so the caller can fall back to a full push.
async function truncateAllTables(
	dialect: Dialect,
	db: RawClient,
): Promise<void> {
	if (dialect === "postgresql") {
		const rows = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
			`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
		);
		const tables = rows.map((r) => `"${r.tablename}"`);
		if (tables.length > 0) {
			await db.$executeRawUnsafe(
				`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`,
			);
		}
		return;
	}
	// The mariadb adapter pools connections, so the session-scoped
	// FOREIGN_KEY_CHECKS=0 only holds inside an interactive transaction. TRUNCATE
	// commits implicitly and would end that transaction, so rows are deleted
	// with DELETE and the counters are reset after the transaction.
	const tables = await db.$transaction(async (tx) => {
		await tx.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 0`);
		// The mariadb driver returns information_schema text columns as binary
		// buffers, so the name is cast to CHAR.
		const rows = await tx.$queryRawUnsafe<Array<{ name: unknown }>>(
			`SELECT CAST(table_name AS CHAR) AS name FROM information_schema.tables WHERE table_schema = DATABASE()`,
		);
		const names = rows.map((r) => String(r.name));
		for (const table of names) {
			await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
		}
		await tx.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 1`);
		return names;
	});
	for (const table of tables) {
		await db.$executeRawUnsafe(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
	}
}

export async function pushPrismaSchema(dialect: Dialect, db?: RawClient) {
	const cwd = import.meta.dirname;
	const prismaCli = resolvePrismaCli();

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
	if (!outputMatch?.[1]) {
		throw new Error(
			`Generated Prisma schema has no output path: ${schemaPath}`,
		);
	}
	const outputDir = join(cwd, outputMatch[1]);

	// When the schema is unchanged since the last push, only clear the data.
	// sqlite pushes are cheap, so sqlite always does a full push.
	let didReset = false;
	if (
		db != null &&
		dialect !== "sqlite" &&
		lastPushedSchema.get(dialect) === schemaKey
	) {
		try {
			await truncateAllTables(dialect, db);
			didReset = true;
		} catch (error) {
			console.warn(
				`[pushPrismaSchema] data-reset fast-path failed for ${dialect}, falling back to full db push:`,
				error,
			);
		}
	}

	try {
		if (!didReset) {
			execFileSync(
				process.execPath,
				[
					prismaCli,
					"db",
					"push",
					"--force-reset",
					"--accept-data-loss",
					"--config",
					configPath,
				],
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
			lastPushedSchema.set(dialect, schemaKey);
		}

		const prevDir = lastGeneratedDir.get(schemaKey);
		if (prevDir && fs.existsSync(prevDir)) {
			fs.cpSync(prevDir, outputDir, { recursive: true });
		} else {
			execFileSync(
				process.execPath,
				[prismaCli, "generate", "--config", configPath],
				{ stdio: "pipe", cwd },
			);
			lastGeneratedDir.set(schemaKey, outputDir);
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
