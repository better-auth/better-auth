import { execSync } from "child_process";
import type { DetectionInfo, ProjectInfo } from "../types";

export async function detectProjectInfo(): Promise<ProjectInfo> {
	return {
		isGit: isGit(),
		packageManager: detectPackageManager(),
	};
}

export function isGit(): boolean {
	try {
		const output = execSync("git rev-parse --is-inside-work-tree", {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
		return output === "true";
	} catch {
		return false;
	}
}

// https://github.com/zkochan/packages/blob/main/which-pm-runs/index.js
export function detectPackageManager(): DetectionInfo | null {
	const userAgent = process.env.npm_config_user_agent;

	if (!userAgent) {
		return null;
	}

	const pmSpec = userAgent.split(" ")[0];
	const separatorPos = pmSpec.lastIndexOf("/");
	const name = pmSpec.substring(0, separatorPos);

	return {
		name: name === "npminstall" ? "cnpm" : name,
		version: pmSpec.substring(separatorPos + 1),
	};
}
