import { generateId } from "./utils/id";
import { hashToBase64 } from "./utils/hash";
import { getNameFromLocalPackageJson } from "./utils/package-json";

let projectIdCached: string | null = null;

export async function getProjectId(
	baseUrl: string | undefined,
): Promise<string> {
	if (projectIdCached) return projectIdCached;

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
