import type { DocsVersionId } from "./docs-versions";

export interface DocsVersionSource {
	contentDirectory: string;
	editBranch: string;
	commitSha: string | null;
}

export const docsVersionSources = {
	latest: {
		contentDirectory: "docs",
		editBranch: "main",
		commitSha: null,
	},
	"1.6": {
		contentDirectory: "_generated/docs/v1-6",
		editBranch: "v1.6.x",
		commitSha: "3dac8247a6f2df15c0a7149a9e7b424d38591964",
	},
} as const satisfies Record<DocsVersionId, DocsVersionSource>;
