import { WebClient } from "@slack/web-api";
import { getOctokit } from "@actions/github";

import type { ReportInput } from "./types";

export function reportInputForDev(): ReportInput {
	const octoClient = getOctokit(import.meta.env.GITHUB_TOKEN!);
	const slackClient = new WebClient(import.meta.env.SLACK_TOKEN!);

	return {
		octoClient,
		slackClient,
		owner: "better-auth",
		repo: "better-auth",
	};
}
