import { setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";

import { WebClient } from "@slack/web-api";

import type { ReportInput } from "./types.ts";
import { popularPrs } from "./reports/popular-prs.ts";

async function run() {
	try {
		if (!process.env.GITHUB_TOKEN) throw new TypeError("GITHUB_TOKEN not set");
		if (!process.env.SLACK_TOKEN) throw new TypeError("SLACK_TOKEN not set");

		const octoClient = getOctokit(process.env.GITHUB_TOKEN);
		const slackClient = new WebClient(process.env.SLACK_TOKEN);

		const { owner, repo } = context.repo;

		const inputs: ReportInput = { octoClient, slackClient, owner, repo };

		await popularPrs(inputs);
	} catch (error: any) {
		setFailed(error);
	}
}

run();
