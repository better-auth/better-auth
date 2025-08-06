import { execSync } from "child_process";

import { generateId } from "../utils";
import { hashToBase64 } from "../crypto";
import { getNameFromLocalPackageJson } from "../utils/package-json";

let projectIdCached: string | null = null;

export async function projectId(baseUrl: string | undefined): Promise<string> {
	if (projectIdCached) return projectIdCached;

	const firstCommit = getFirstCommitHash();
	if (firstCommit) {
		projectIdCached = await hashToBase64(
			baseUrl ? baseUrl + firstCommit : firstCommit,
		);
		return projectIdCached;
	}

	const projectName = await getNameFromLocalPackageJson();
	if (projectName) {
		projectIdCached = await hashToBase64(
			baseUrl ? baseUrl + projectName : projectName,
		);
		return projectIdCached;
	}

	if (baseUrl) {
		projectIdCached = await hashToBase64(baseUrl);
		return projectIdCached;
	}

	projectIdCached = generateId(32);
	return projectIdCached;
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
