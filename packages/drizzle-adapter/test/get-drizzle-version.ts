import { execSync } from "node:child_process";

let cachedDrizzleVersion: { kit: string; orm: string } | null = null;

export const getDrizzleVersion = async (beta: boolean = false) => {
	if (cachedDrizzleVersion) return cachedDrizzleVersion;
	const version = execSync(`npx drizzle-kit@${beta ? "beta" : ""} --version`, {
		cwd: import.meta.dirname,
		stdio: ["ignore", "pipe", "pipe"],
	})
		.toString()
		.trim()
		.split("\n")
		.map((line) => line.trim().split(":")[1]?.trim()!)
		.reduce(
			(acc, curr, i) => {
				if (i === 0) {
					acc.kit = curr;
				} else {
					acc.orm = curr;
				}
				return acc;
			},
			{} as { kit: string; orm: string },
		);
	cachedDrizzleVersion = version;
	return version;
};

export const instalBetaDrizzle = async () => {
	console.log("Installing beta drizzle-orm...");
	try {
		execSync(`pnpm i drizzle-orm@beta`, {
			cwd: import.meta.dirname,
			stdio: "inherit",
		});
	} catch (error) {
		console.error("Failed to install beta drizzle-orm:", error);
		throw error;
	}
};
