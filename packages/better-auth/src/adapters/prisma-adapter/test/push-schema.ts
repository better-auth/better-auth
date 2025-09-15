import { execSync } from "child_process";

export function pushPrismaSchema(schema: "normal" | "number-id") {
	if (schema === "normal") {
		execSync("pnpm prisma:normal:push", { stdio: "inherit" });
	} else {
		execSync("pnpm prisma:number-id:push", { stdio: "inherit" });
	}
}
