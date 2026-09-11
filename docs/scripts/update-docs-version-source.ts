import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { docsVersionSources } from "../lib/docs-version-sources.ts";
import { docsVersions } from "../lib/docs-versions.ts";

const commitShaPattern = /^[0-9a-f]{40}$/;
const sourceFilePath = fileURLToPath(
	new URL("../lib/docs-version-sources.ts", import.meta.url),
);

export interface DocsVersionSourceUpdate {
	content: string;
	previousCommitSha: string;
	releaseLine: string;
}

export function updateDocsVersionSource(
	content: string,
	editBranch: string,
	commitSha: string,
): DocsVersionSourceUpdate | null {
	if (!commitShaPattern.test(commitSha)) {
		throw new Error(`Invalid commit SHA: ${commitSha}`);
	}

	const entry = Object.entries(docsVersionSources).find(
		([, source]) => source.editBranch === editBranch,
	);
	if (!entry || entry[1].commitSha === null) return null;

	const [versionId, source] = entry;
	const version = docsVersions.find((version) => version.id === versionId);
	if (!version) throw new Error(`Missing docs version for ${versionId}`);

	const previousCommitSha = source.commitSha;
	if (previousCommitSha === commitSha) return null;

	const assignment = new RegExp(
		`(commitSha\\s*:\\s*)${JSON.stringify(previousCommitSha)}`,
		"g",
	);
	if (content.match(assignment)?.length !== 1) {
		throw new Error(`Expected one commitSha entry for ${editBranch}`);
	}

	return {
		content: content.replace(assignment, `$1${JSON.stringify(commitSha)}`),
		previousCommitSha,
		releaseLine: version.releaseLine,
	};
}

async function main() {
	const [editBranch, commitSha] = process.argv.slice(2);
	if (!editBranch || !commitSha) {
		throw new Error(
			"Usage: node update-docs-version-source.ts <branch> <commit-sha>",
		);
	}

	const content = await readFile(sourceFilePath, "utf8");
	const update = updateDocsVersionSource(content, editBranch, commitSha);
	if (!update) {
		console.log("changed=false");
		return;
	}

	await writeFile(sourceFilePath, update.content);
	console.log("changed=true");
	console.log(`release_line=${update.releaseLine}`);
	console.log(`previous_sha=${update.previousCommitSha}`);
}

if (import.meta.main) {
	await main();
}
