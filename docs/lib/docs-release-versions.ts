import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { docsVersions } from "./docs-versions";

export function getDocsReleaseVersions(): Record<string, string | null> {
	const metadataPath = join(
		process.cwd(),
		"content",
		"_generated",
		"docs",
		"release-versions.json",
	);
	let metadata: unknown;
	try {
		metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
	} catch (cause) {
		throw new Error(
			`Missing or invalid release metadata: ${metadataPath}. Run sync-versions first.`,
			{ cause },
		);
	}
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
		throw new Error(`Invalid release metadata: ${metadataPath}`);
	}

	const values = metadata as Record<string, unknown>;
	return Object.fromEntries(
		docsVersions.map((version) => {
			const releaseVersion = values[version.id];
			if (releaseVersion !== null && typeof releaseVersion !== "string") {
				throw new Error(
					`Invalid release metadata for ${version.id}: ${metadataPath}`,
				);
			}
			return [version.id, releaseVersion];
		}),
	);
}
