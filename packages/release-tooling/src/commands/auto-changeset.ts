import { recommendChangeset } from "../changesets/recommend.ts";
import { runCommand } from "../command.ts";
import { createGitHubReader, parseGitHubRepository } from "../github.ts";

await runCommand(() => {
	const repository = process.env.GITHUB_REPOSITORY;
	if (!repository) throw new Error("GITHUB_REPOSITORY is required");
	const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	if (!token) throw new Error("GH_TOKEN or GITHUB_TOKEN is required");
	const prNumber = Number(process.env.PR_NUMBER);
	if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
		throw new Error("PR_NUMBER must be a positive integer");
	}

	return recommendChangeset(
		createGitHubReader({
			repository: parseGitHubRepository(repository),
			token,
			baseUrl: process.env.GITHUB_API_URL,
		}),
		{
			force: process.env.FORCE === "true",
			prNumber,
		},
	);
});
