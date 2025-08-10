import { setFailed } from "@actions/core";
import { WebClient } from "@slack/web-api";
import { getOctokit } from "@actions/github";

import type { ReportInput } from "./types.ts";

import { ninetyDaysAgo } from "./utils.ts";
import { postGitHubReport } from "./report.ts";

async function run() {
	try {
		if (!process.env.GITHUB_TOKEN) throw new TypeError("GITHUB_TOKEN not set");
		if (!process.env.SLACK_TOKEN) throw new TypeError("SLACK_TOKEN not set");

		const input: ReportInput = {
			octoClient: getOctokit(process.env.GITHUB_TOKEN),
			slackClient: new WebClient(process.env.SLACK_TOKEN),
			owner: "better-auth",
			repo: "better-auth",
		};

		// popular prs sorted by reactions
		await postGitHubReport(input, {
			search: {
				order: "desc",
				per_page: 5,
				q: `is:pr is:open created:>=${ninetyDaysAgo()}`,
				sort: "reactions",
			},
			renderTitle: (count) =>
				`:trophy: *Top ${count} PRs by Reactions in the Last 90 Days*`,
			renderField: (pr) => `*:star: Reactions:* ${pr.reactions?.total_count}`,
		});

		// popular issues sorted by reactions
		await postGitHubReport(input, {
			search: {
				order: "desc",
				per_page: 5,
				q: `is:issue is:open created:>=${ninetyDaysAgo()}`,
				sort: "reactions",
			},
			renderTitle: (count) =>
				`:trophy: *Top ${count} Issues by Reactions in the Last 90 Days*`,
			renderField: (pr) => `*:star: Reactions:* ${pr.reactions?.total_count}`,
		});

		// popular prs sorted by comments
		await postGitHubReport(input, {
			search: {
				order: "desc",
				per_page: 5,
				q: `is:pr is:open created:>=${ninetyDaysAgo()}`,
				sort: "comments",
			},
			renderTitle: (count) =>
				`:speech_balloon: *Top ${count} PRs by Comments in the Last 90 Days*`,
			renderField: (issue) => `*:speech_balloon: Comments:* ${issue.comments}`,
		});

		// popular issues sorted by comments
		await postGitHubReport(input, {
			search: {
				order: "desc",
				per_page: 5,
				q: `is:issue is:open created:>=${ninetyDaysAgo()}`,
				sort: "comments",
			},
			renderTitle: (count) =>
				`:speech_balloon: *Top ${count} Issues by Comments in the Last 90 Days*`,
			renderField: (issue) => `*:speech_balloon: Comments:* ${issue.comments}`,
		});
	} catch (error: any) {
		setFailed(error);
	}
}

run();
