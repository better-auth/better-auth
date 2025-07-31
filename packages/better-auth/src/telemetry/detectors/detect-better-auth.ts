import type { DetectionInfo } from "../types";

export async function detectBetterAuth(): Promise<DetectionInfo | undefined> {
	try {
		if (typeof process !== "undefined") {
			try {
				const fs = require("fs");
				const path = require("path");

				let currentDir = process.cwd();
				while (currentDir !== path.parse(currentDir).root) {
					const packageJsonPath = path.join(currentDir, "package.json");
					if (fs.existsSync(packageJsonPath)) {
						const packageJson = JSON.parse(
							fs.readFileSync(packageJsonPath, "utf8"),
						);

						const version =
							packageJson.dependencies?.["better-auth"] ||
							packageJson.devDependencies?.["better-auth"];

						if (version) {
							return {
								name: "better-auth",
								version: version.replace(/[\^~>=]/g, ""),
							};
						}
					}
					currentDir = path.dirname(currentDir);
				}
			} catch {}
		}

		return undefined;
	} catch {
		return undefined;
	}
}
