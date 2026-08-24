import { recommendChangeset } from "../changesets/recommend.ts";
import { runCommand } from "../command.ts";
import { createGitHubReader, parseGitHubRepository } from "../github-reader.ts";

await runCommand(() => {
	const repository = process.env.GITHUB_REPOSITORY;
	if (!repository) throw new Error("GITHUB_REPOSITORY is required");

	return recommendChangeset(
		createGitHubReader({
			repository: parseGitHubRepository(repository),
			token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
			baseUrl: process.env.GITHUB_API_URL,
		}),
	);
});
