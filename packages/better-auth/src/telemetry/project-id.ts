import { execSync } from "child_process";
import { hashToBase64 } from "../crypto";
import { getNameFromLocalPackageJson } from "../utils/package-json";

let projectIdCached: string | null = null;

export async function projectId(baseUrl: string | undefined) {
	if (projectIdCached) return projectIdCached;

	const firstCommit = getFirstCommitHash();
	if (firstCommit) {
		const id = await hashToBase64(
			baseUrl ? baseUrl + firstCommit : firstCommit,
		);
		return id;
	}

	const projectName = await getNameFromLocalPackageJson();
	if (projectName) {
		const id = await hashToBase64(
			baseUrl ? baseUrl + projectName : projectName,
		);
		return id;
	}

	return null;
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
