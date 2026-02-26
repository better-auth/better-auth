import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const DATABASE_URLS: Record<string, string> = {
	sqlite: "file:./dev.db",
	postgresql: "postgres://user:password@localhost:5434/better_auth",
	mysql: "mysql://user:password@localhost:3308/better_auth",
};

// Track the last generated output directory per schema content hash,
// so we can copy it instead of running prisma generate again.
const lastGeneratedDir = new Map<string, string>();

export async function pushPrismaSchema(
	dialect: "sqlite" | "postgresql" | "mysql",
) {
	const cwd = join(import.meta.dirname);
	const node = process.execPath;
	const require = createRequire(import.meta.url);
	const prismaPackageJson = require.resolve("prisma/package.json");
	const cli = join(dirname(prismaPackageJson), "build", "index.js");

	const configContent = `import { defineConfig } from "prisma/config";
export default defineConfig({
	schema: "./schema-${dialect}.prisma",
	datasource: {
		url: "${DATABASE_URLS[dialect]}",
	},
});
`;
	const configPath = join(cwd, `prisma-config-${dialect}.ts`);
	fs.writeFileSync(configPath, configContent, "utf-8");

	// Read the current schema (without the output line) to detect changes
	const schemaPath = join(cwd, `schema-${dialect}.prisma`);
	const schemaContent = fs.readFileSync(schemaPath, "utf-8");
	// Strip the output line for comparison since it differs each iteration
	const schemaKey = schemaContent.replace(/\s*output\s*=\s*"[^"]*"\n?/, "");

	// Determine the output directory from the schema
	const outputMatch = schemaContent.match(/output\s*=\s*"([^"]*)"/);
	const outputDir = outputMatch ? join(cwd, outputMatch[1]) : null;

	try {
		execSync(
			`${node} ${cli} db push --force-reset --accept-data-loss --config ${configPath}`,
			{
				stdio: "pipe",
				cwd,
				env: {
					...process.env,
					PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
						"I am running tests in a local development environment",
				},
			},
		);

		if (outputDir) {
			const prevDir = lastGeneratedDir.get(schemaKey);
			if (prevDir && fs.existsSync(prevDir)) {
				// Schema unchanged — copy previously generated client instead
				// of running prisma generate again (saves ~1-2s per migration)
				fs.cpSync(prevDir, outputDir, { recursive: true });
			} else {
				// Schema changed — run prisma generate
				execSync(`${node} ${cli} generate --config ${configPath}`, {
					stdio: "pipe",
					cwd,
				});
				lastGeneratedDir.set(schemaKey, outputDir);
			}
		}
	} catch (error) {
		const err = error as { stdout?: Buffer; stderr?: Buffer };
		const stdout = err.stdout?.toString() || "";
		const stderr = err.stderr?.toString() || "";
		console.error(`[pushPrismaSchema] failed for ${dialect}:`);
		if (stdout) console.error(`stdout: ${stdout}`);
		if (stderr) console.error(`stderr: ${stderr}`);
		throw error;
	} finally {
		fs.unlinkSync(configPath);
	}
}
