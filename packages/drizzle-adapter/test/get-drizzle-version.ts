import { execSync } from "node:child_process";

export const getDrizzleVersion = async (beta: boolean = false) => {
	const version = execSync(`npx drizzle-kit@${beta} --version`, {
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
	return version;
};
