import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { DATABASE_URLS, type Dialect } from "./constants";

// Cache previously generated client directories per schema content,
// so we can copy instead of running `prisma generate` again.
const lastGeneratedDir = new Map<string, string>();

function resolvePrismaCli() {
	const require = createRequire(import.meta.url);
	return join(dirname(require.resolve("prisma/package.json")), "build", "index.js");
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
		execSync(`${cli} db push --force-reset --accept-data-loss --config ${configPath}`, {
			stdio: "pipe",
			cwd,
			env: {
				...process.env,
				// Prisma v7 blocks --force-reset when it detects an AI agent; this env var grants consent.
				PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
					"I am running tests in a local development environment",
			},
		});

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
