import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

export async function pushPrismaSchema() {
	const node = process.execPath;
	const cli = createRequire(import.meta.url).resolve("prisma");
	execSync(`${node} ${cli} db push --schema ./schema.prisma`, {
		stdio: "ignore", // use `inherit` if you want to see the output
		cwd: join(import.meta.dirname),
	});
}
