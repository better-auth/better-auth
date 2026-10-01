import docsVersionSourcesManifest from "./docs-version-sources.json" with {
	type: "json",
};
import type { DocsVersionId } from "./docs-versions";

export interface DocsVersionSource {
	contentDirectory: string;
	editBranch: string;
	commitSha: string | null;
}

export const docsVersionSources = docsVersionSourcesManifest satisfies Record<
	DocsVersionId,
	DocsVersionSource
>;
