import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const DATABASE_URLS: Record<string, string> = {
	sqlite: "file:./dev.db",
	postgresql: "postgres://user:password@localhost:5434/better_auth",
	mysql: "mysql://user:password@localhost:3308/better_auth",
};

export async function pushPrismaSchema(
	dialect: "sqlite" | "postgresql" | "mysql",
) {
	const cwd = join(import.meta.dirname);
	const node = process.execPath;
	const cli = createRequire(import.meta.url).resolve("prisma");

	// Write a temporary prisma.config.ts for this dialect
	const configContent = `import { defineConfig } from "prisma/config";
export default defineConfig({
	schema: "./schema-${dialect}.prisma",
	datasource: {
		url: "${DATABASE_URLS[dialect]}",
	},
});
`;
	const configPath = join(cwd, "prisma.config.ts");
	fs.writeFileSync(configPath, configContent, "utf-8");

	try {
		execSync(`${node} ${cli} db push`, {
			stdio: "inherit",
			cwd,
		});
		execSync(`${node} ${cli} generate`, {
			stdio: "inherit",
			cwd,
		});
	} finally {
		// Restore the original prisma.config.ts for the base schema
		const originalConfig = `import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: "./base.prisma",
	datasource: {
		url: "file:./dev.db",
	},
});
`;
		fs.writeFileSync(configPath, originalConfig, "utf-8");
	}
}
