import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import fs from "node:fs/promises";
import { join } from "node:path";

export async function pushPrismaSchema(
	dialect: "sqlite" | "postgresql" | "mysql",
) {
	const cwd = join(import.meta.dirname);
	// In Prisma v7, use pnpm exec to run prisma CLI
	execSync(`pnpm exec prisma db push --schema ./schema-${dialect}.prisma`, {
		stdio: "inherit", // use `inherit` if you want to see the output
		cwd,
	});

	// Read the schema to extract the output path
	const schemaPath = join(cwd, `schema-${dialect}.prisma`);
	const schemaContent = await fs.readFile(schemaPath, "utf-8");
	const outputMatch = schemaContent.match(/output\s*=\s*"([^"]+)"/);
	if (outputMatch) {
		const outputPath = join(cwd, outputMatch[1]!);
		// Remove existing output directory if it exists
		try {
			rmSync(outputPath, { recursive: true, force: true });
		} catch {
			// Ignore errors if directory doesn't exist
		}
	}

	// After pushing the schema, generate the Prisma client
	execSync(`pnpm exec prisma generate --schema ./schema-${dialect}.prisma`, {
		stdio: "inherit",
		cwd,
	});
}
