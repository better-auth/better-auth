import { execSync } from "child_process";
import type { DetectionInfo, ProjectInfo } from "../types";
import { hashToBase64 } from "../../crypto";
import { getNameFromLocalPackageJson } from "../../utils/package-json";

export async function detectProjectInfo(baseUrl: string): Promise<ProjectInfo> {
	let isGit = false;
	let anonymousProjectId = null;

	const firstCommit = getFirstCommitHash();
	if (firstCommit) {
		isGit = true;
		anonymousProjectId = await hashToBase64(baseUrl + firstCommit);
	}

	const projectName = await getNameFromLocalPackageJson();
	if (projectName) {
		anonymousProjectId = await hashToBase64(baseUrl + projectName);
	}

	return {
		isGit,
		anonymousProjectId,
		packageManager: detectPackageManager(),
	};
}

function getFirstCommitHash(): string | null {
	try {
		const originBuffer = execSync(`git rev-list --max-parents=0 HEAD`, {
			timeout: 500,
			stdio: ["ignore", "pipe", "ignore"],
		});
		return String(originBuffer).trim();
	} catch (_) {
		return null;
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
