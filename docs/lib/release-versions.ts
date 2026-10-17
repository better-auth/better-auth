import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import type { ResolvedDocsVersion } from "./docs-versions";
import { docsVersions } from "./docs-versions";

const releaseVersionsSchema = z.record(z.string(), z.string());

export function loadDocsVersions(): ResolvedDocsVersion[] {
	const metadataPath = join(
		process.cwd(),
		"content",
		"_generated",
		"docs",
		"release-versions.json",
	);
	let releaseVersions: z.infer<typeof releaseVersionsSchema>;
	try {
		releaseVersions = releaseVersionsSchema.parse(
			JSON.parse(readFileSync(metadataPath, "utf8")),
		);
	} catch (cause) {
		throw new Error(
			`Unable to read ${metadataPath}. Run sync-versions first.`,
			{
				cause,
			},
		);
	}
	return docsVersions.map((version) => {
		const releaseVersion = releaseVersions[version.id];
		if (
			releaseVersion === undefined ||
			!releaseVersion.startsWith(`${version.releaseLine}.`)
		) {
			throw new Error(`Invalid release version for ${version.id}`);
		}
		return { ...version, releaseVersion };
	});
}
