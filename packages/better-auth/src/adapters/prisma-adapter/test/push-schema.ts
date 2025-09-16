import { execSync } from "child_process";
import { join } from "node:path";
import { createRequire } from "node:module";

export function pushPrismaSchema(schema: "normal" | "number-id") {
	const node = process.execPath;
	const cli = createRequire(import.meta.url).resolve("prisma");
	if (schema === "normal") {
		execSync(`${node} ${cli} db push --schema ./schema.prisma`, {
			stdio: "inherit",
			cwd: join(import.meta.dirname, "normal-tests"),
		});
	} else {
		execSync(`${node} ${cli} db push --schema ./schema.prisma`, {
			stdio: "inherit",
			cwd: join(import.meta.dirname, "number-id-tests"),
		});
	}
}
