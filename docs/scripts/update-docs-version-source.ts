import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { docsVersionSources } from "../lib/docs-version-sources.ts";
import { docsVersions } from "../lib/docs-versions.ts";

const commitShaPattern = /^[0-9a-f]{40}$/;
const sourcesFilePath = fileURLToPath(
	new URL("../lib/docs-version-sources.json", import.meta.url),
);

interface DocsVersionSourceUpdate {
	serializedSources: string;
	previousCommitSha: string;
	releaseLine: string;
}

function getDocsVersionSourceUpdate(
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

	const updatedSources = {
		...docsVersionSources,
		[versionId]: { ...source, commitSha },
	};

	return {
		serializedSources: `${JSON.stringify(updatedSources, null, 2)}\n`,
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

	const update = getDocsVersionSourceUpdate(editBranch, commitSha);
	if (!update) {
		console.log("changed=false");
		return;
	}

	await writeFile(sourcesFilePath, update.serializedSources);
	console.log("changed=true");
	console.log(`release_line=${update.releaseLine}`);
	console.log(`previous_sha=${update.previousCommitSha}`);
}

if (import.meta.main) {
	await main();
}
