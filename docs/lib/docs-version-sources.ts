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
		commitSha: "886311168d86a75496f4e2bc339a6e5516a13d08",
	},
} as const satisfies Record<DocsVersionId, DocsVersionSource>;
