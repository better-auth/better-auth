import { describe, expect, it } from "vitest";
import { recommendChangeset } from "../src/changesets/recommend.ts";
import type { GitHubPullRequest, GitHubReader } from "../src/github.ts";

function githubReader(pullRequest: GitHubPullRequest): GitHubReader {
	return {
		async getPullRequest() {
			return pullRequest;
		},
		async getReleaseBody() {
			return null;
		},
	};
}

describe("changeset recommendation", () => {
	it("skips private release-tooling changes", async () => {
		const outputs = new Map<string, string>();
		await recommendChangeset(
			githubReader({
				number: 42,
				title: "fix(release): update preview generation",
				body: "",
				author: "octocat",
				headRef: "fix/release-preview",
				baseRef: "main",
				labels: [],
				isFork: false,
				changedFiles: ["packages/release-tooling/src/release-notes/render.ts"],
				diff: "",
			}),
			{
				force: true,
				prNumber: 42,
				output: (name, value) => outputs.set(name, value),
			},
		);

		expect(outputs).toEqual(
			new Map([
				["skip", "true"],
				["skip_reason", "no publishable package files changed"],
			]),
		);
	});
});
